import {
  Client, GatewayIntentBits, Events, REST, Routes,
  SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits,
  Collection,
  type Interaction, type GuildMember, type ChatInputCommandInteraction,
  type Guild, type TextChannel,
} from "discord.js";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });
const token = process.env["DISCORD_BOT_TOKEN"];
const clientId = process.env["DISCORD_CLIENT_ID"];
if (!token) { logger.error("DISCORD_BOT_TOKEN required"); process.exit(1); }

process.on("uncaughtException", (err) => logger.error({ err }, "Uncaught exception"));
process.on("unhandledRejection", (reason) => logger.error({ reason }, "Unhandled rejection"));

// ─── COMMANDS ────────────────────────────────────────────────────────────────

// /setup_takeover
const setupTakeoverData = new SlashCommandBuilder()
  .setName("setup_takeover")
  .setDescription("Wipe and rebuild the MC Takeovers server from scratch")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function nukeServer(guild: Guild) {
  await Promise.all([...guild.channels.cache.values()].map((ch) => ch.delete().catch(() => null)));
  const botPos = guild.members.me?.roles.highest.position ?? 0;
  const roles = [...guild.roles.cache.values()].filter((r) => !r.managed && r.name !== "@everyone" && r.position < botPos);
  await Promise.all(roles.map((r) => r.delete().catch(() => null)));
}

async function setupTakeoverExecute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) { await interaction.reply({ content: "Server only.", ephemeral: true }); return; }
  await interaction.reply({ content: "🗑️ Wiping all channels and roles...", ephemeral: true });
  try {
    await nukeServer(guild);
    await new Promise((r) => setTimeout(r, 2000));

    const og     = await guild.roles.create({ name: "OG",           color: 0xffd700, hoist: true, mentionable: true });
    const host   = await guild.roles.create({ name: "Takeover Host",color: 0xff4500, hoist: true, mentionable: true });
    const mod    = await guild.roles.create({ name: "Moderator",    color: 0x1e90ff, hoist: true, mentionable: true });
    const member = await guild.roles.create({ name: "MC Member",    color: 0x2ecc71 });
    const ev = guild.roles.everyone;

    const infoCat = await guild.channels.create({ name: "📌 INFO", type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: ev.id,   allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: host.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
        { id: mod.id,  allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ],
    });
    const rules = await guild.channels.create({ name: "takeover-rules", type: ChannelType.GuildText, parent: infoCat.id }) as TextChannel;
    const announcements = await guild.channels.create({ name: "announcements", type: ChannelType.GuildText, parent: infoCat.id,
      permissionOverwrites: [
        { id: ev.id,   allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: host.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.MentionEveryone] },
        { id: mod.id,  allow: [PermissionFlagsBits.SendMessages] },
      ],
    }) as TextChannel;

    const genCat = await guild.channels.create({ name: "💬 GENERAL", type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: ev.id,     deny:  [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: og.id,     allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: host.id,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
        { id: mod.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ],
    });
    const general = await guild.channels.create({ name: "general", type: ChannelType.GuildText, parent: genCat.id }) as TextChannel;
    await guild.channels.create({ name: "clips-and-media", type: ChannelType.GuildText, parent: genCat.id });

    const takeCat = await guild.channels.create({ name: "🚗 TAKEOVERS", type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: ev.id,     deny:  [PermissionFlagsBits.ViewChannel] },
        { id: member.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: og.id,     allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: host.id,   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.MentionEveryone] },
        { id: mod.id,    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ],
    });
    const events = await guild.channels.create({ name: "takeover-events", type: ChannelType.GuildText, parent: takeCat.id }) as TextChannel;
    await guild.channels.create({ name: "locations", type: ChannelType.GuildText, parent: takeCat.id });
    await guild.channels.create({ name: "Takeover VC", type: ChannelType.GuildVoice, parent: takeCat.id,
      permissionOverwrites: [
        { id: ev.id,     deny:  [PermissionFlagsBits.Connect] },
        { id: member.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: og.id,     allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
        { id: host.id,   allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers, PermissionFlagsBits.DeafenMembers] },
        { id: mod.id,    allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers] },
      ],
    });

    await rules.send("**MIDNIGHT CHASERS TAKEOVER RULES**\n\n> - No trolling or ruining the event\n> - Respect all members\n> - Follow the host's instructions in-game\n> - No spamming the private server link\n> - Stay in the designated area unless told otherwise\n\nBreaking rules may result in a ban.\n\n**Roles:** @OG | @Takeover Host | @Moderator | @MC Member");
    await events.send("**Upcoming Midnight Chasers Takeovers**\n- Friday Night Drift\n- Weekend City Runs\n\nStay tuned — hosts will post private server links here using `/takeover_start`.");
    await general.send("Welcome to Midnight Chasers Takeovers 🚗💨");
    await announcements.send("📢 **Midnight Chasers Takeovers is now live!**\nHosts can use `/takeover_start` to post event details and Roblox private server links.");
    await interaction.followUp({ content: "✅ Server rebuilt!\n\n🥇 OG | 🔴 Takeover Host | 🔵 Moderator | 🟢 MC Member\n3 categories, 6 text channels, 1 voice channel", ephemeral: true });
  } catch (err) {
    console.error(err);
    await interaction.followUp({ content: "Error during setup.", ephemeral: true });
  }
}

// /takeover_start
const takeoverStartData = new SlashCommandBuilder()
  .setName("takeover_start").setDescription("Post a Midnight Chasers takeover event announcement")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addStringOption((o) => o.setName("theme").setDescription("Theme/name of the takeover").setRequired(true))
  .addStringOption((o) => o.setName("location").setDescription("In-game location").setRequired(true))
  .addStringOption((o) => o.setName("date").setDescription("Date (e.g. Saturday March 29th)").setRequired(true))
  .addStringOption((o) => o.setName("time").setDescription("Start time (e.g. 10:00 PM EST)").setRequired(true))
  .addStringOption((o) => o.setName("private_server").setDescription("Roblox private server link").setRequired(false))
  .addStringOption((o) => o.setName("details").setDescription("Extra details/notes").setRequired(false));

async function takeoverStartExecute(interaction: ChatInputCommandInteraction) {
  const theme = interaction.options.getString("theme", true);
  const location = interaction.options.getString("location", true);
  const date = interaction.options.getString("date", true);
  const time = interaction.options.getString("time", true);
  const privateServer = interaction.options.getString("private_server");
  const details = interaction.options.getString("details");
  const embed = new EmbedBuilder().setColor(0xff4500)
    .setTitle(`🚗 MIDNIGHT CHASERS TAKEOVER — ${theme.toUpperCase()}`)
    .setDescription("A new takeover event has been announced. Gear up and get in the server!")
    .addFields({ name: "📅 Date", value: date, inline: true }, { name: "🕐 Time", value: time, inline: true }, { name: "\u200B", value: "\u200B", inline: true }, { name: "📍 In-Game Location", value: location });
  if (details) embed.addFields({ name: "📋 Details", value: details });
  if (privateServer) embed.addFields({ name: "🎮 Roblox Private Server", value: `[Click here to join](${privateServer})` });
  embed.setFooter({ text: `Posted by ${interaction.user.username} • Midnight Chasers`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
  const guild = interaction.guild;
  if (guild) {
    const mentions = ["OG", "Takeover Host", "MC Member"].map((n) => guild.roles.cache.find((r) => r.name === n)).filter(Boolean).map((r) => `<@&${r!.id}>`).join(" ");
    if (mentions) await interaction.followUp({ content: `${mentions} New Midnight Chasers takeover incoming! 🚗💨` });
  }
}

// /takeover_end
const takeoverEndData = new SlashCommandBuilder()
  .setName("takeover_end").setDescription("Announce the current takeover has ended")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addStringOption((o) => o.setName("message").setDescription("Optional closing message").setRequired(false));

async function takeoverEndExecute(interaction: ChatInputCommandInteraction) {
  const message = interaction.options.getString("message");
  const embed = new EmbedBuilder().setColor(0x2c2f33).setTitle("🏁 Takeover Has Ended")
    .setDescription(message ?? "That's a wrap! Thanks for pulling up. Stay tuned for the next one. 🚗💨")
    .setFooter({ text: `Closed by ${interaction.user.username} • Midnight Chasers`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
  const guild = interaction.guild;
  if (guild) {
    const mentions = ["OG", "MC Member"].map((n) => guild.roles.cache.find((r) => r.name === n)).filter(Boolean).map((r) => `<@&${r!.id}>`).join(" ");
    if (mentions) await interaction.followUp({ content: `${mentions} The takeover is over for tonight!` });
  }
}

// /announce
const announceData = new SlashCommandBuilder()
  .setName("announce").setDescription("Send an announcement embed").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption((o) => o.setName("title").setDescription("Title").setRequired(true))
  .addStringOption((o) => o.setName("message").setDescription("Message").setRequired(true))
  .addStringOption((o) => o.setName("ping").setDescription("Who to ping").setRequired(false)
    .addChoices({ name: "Everyone", value: "@everyone" }, { name: "MC Member", value: "MC Member" }, { name: "OG", value: "OG" }, { name: "Takeover Host", value: "Takeover Host" }, { name: "No ping", value: "none" }));

async function announceExecute(interaction: ChatInputCommandInteraction) {
  const title = interaction.options.getString("title", true);
  const message = interaction.options.getString("message", true);
  const ping = interaction.options.getString("ping") ?? "none";
  const embed = new EmbedBuilder().setColor(0xff4500).setTitle(`📢 ${title}`).setDescription(message)
    .setFooter({ text: `Announced by ${interaction.user.username} • Midnight Chasers`, iconURL: interaction.user.displayAvatarURL() }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
  if (ping !== "none") {
    if (ping === "@everyone") await interaction.followUp({ content: "@everyone" });
    else { const role = interaction.guild?.roles.cache.find((r) => r.name === ping); if (role) await interaction.followUp({ content: `<@&${role.id}>` }); }
  }
}

// /role_give
const roleGiveData = new SlashCommandBuilder()
  .setName("role_give").setDescription("Give a role to a member").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
  .addStringOption((o) => o.setName("role").setDescription("Role to give").setRequired(true)
    .addChoices({ name: "OG", value: "OG" }, { name: "Takeover Host", value: "Takeover Host" }, { name: "Moderator", value: "Moderator" }, { name: "MC Member", value: "MC Member" }));

async function roleGiveExecute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild!;
  const target = interaction.options.getUser("member", true);
  const roleName = interaction.options.getString("role", true);
  const role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) { await interaction.reply({ content: `❌ Role **${roleName}** not found. Run \`/setup_takeover\` first.`, ephemeral: true }); return; }
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.reply({ content: "❌ Member not found.", ephemeral: true }); return; }
  if (member.roles.cache.has(role.id)) { await interaction.reply({ content: `⚠️ ${target.username} already has **${roleName}**.`, ephemeral: true }); return; }
  await member.roles.add(role);
  await interaction.reply({ content: `✅ Gave **${roleName}** to ${target.username}.` });
}

// /role_remove
const roleRemoveData = new SlashCommandBuilder()
  .setName("role_remove").setDescription("Remove a role from a member").setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addUserOption((o) => o.setName("member").setDescription("Member").setRequired(true))
  .addStringOption((o) => o.setName("role").setDescription("Role to remove").setRequired(true)
    .addChoices({ name: "OG", value: "OG" }, { name: "Takeover Host", value: "Takeover Host" }, { name: "Moderator", value: "Moderator" }, { name: "MC Member", value: "MC Member" }));

async function roleRemoveExecute(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild!;
  const target = interaction.options.getUser("member", true);
  const roleName = interaction.options.getString("role", true);
  const role = guild.roles.cache.find((r) => r.name === roleName);
  if (!role) { await interaction.reply({ content: `❌ Role **${roleName}** not found.`, ephemeral: true }); return; }
  const member = await guild.members.fetch(target.id).catch(() => null);
  if (!member) { await interaction.reply({ content: "❌ Member not found.", ephemeral: true }); return; }
  if (!member.roles.cache.has(role.id)) { await interaction.reply({ content: `⚠️ ${target.username} doesn't have **${roleName}**.`, ephemeral: true }); return; }
  await member.roles.remove(role);
  await interaction.reply({ content: `✅ Removed **${roleName}** from ${target.username}.` });
}

// /clear
const clearData = new SlashCommandBuilder()
  .setName("clear").setDescription("Delete recent messages").setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addIntegerOption((o) => o.setName("amount").setDescription("Number of messages (1–100)").setRequired(true).setMinValue(1).setMaxValue(100));

async function clearExecute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) { await interaction.reply({ content: "❌ Text channels only.", ephemeral: true }); return; }
  await interaction.deferReply({ ephemeral: true });
  const deleted = await (interaction.channel as TextChannel).bulkDelete(amount, true).catch(() => null);
  await interaction.editReply({ content: `🗑️ Deleted **${deleted?.size ?? 0}** messages.` });
}

// /8ball
const eightBallData = new SlashCommandBuilder()
  .setName("8ball").setDescription("Ask the magic 8 ball")
  .addStringOption((o) => o.setName("question").setDescription("Your question").setRequired(true));

const ballResponses = [
  { text: "It is certain.", emoji: "🟢" }, { text: "It is decidedly so.", emoji: "🟢" },
  { text: "Without a doubt.", emoji: "🟢" }, { text: "Yes, definitely.", emoji: "🟢" },
  { text: "Most likely.", emoji: "🟢" }, { text: "Yes.", emoji: "🟢" },
  { text: "Signs point to yes.", emoji: "🟢" }, { text: "Ask again later.", emoji: "🟡" },
  { text: "Cannot predict now.", emoji: "🟡" }, { text: "Better not tell you now.", emoji: "🟡" },
  { text: "Don't count on it.", emoji: "🔴" }, { text: "My reply is no.", emoji: "🔴" },
  { text: "Very doubtful.", emoji: "🔴" }, { text: "Outlook not so good.", emoji: "🔴" },
];

async function eightBallExecute(interaction: ChatInputCommandInteraction) {
  const question = interaction.options.getString("question", true);
  const response = ballResponses[Math.floor(Math.random() * ballResponses.length)]!;
  const embed = new EmbedBuilder().setColor(0x36393f).setTitle("🎱 Magic 8 Ball")
    .addFields({ name: "Question", value: question }, { name: "Answer", value: `${response.emoji} ${response.text}` })
    .setFooter({ text: `Asked by ${interaction.user.username}` });
  await interaction.reply({ embeds: [embed] });
}

// /coinflip
const coinflipData = new SlashCommandBuilder().setName("coinflip").setDescription("Flip a coin");

async function coinflipExecute(interaction: ChatInputCommandInteraction) {
  const result = Math.random() < 0.5 ? "Heads" : "Tails";
  const embed = new EmbedBuilder().setColor(result === "Heads" ? 0xffd700 : 0x99aab5)
    .setTitle(`${result === "Heads" ? "🪙" : "🔘"} ${result}!`)
    .setFooter({ text: `Flipped by ${interaction.user.username}` });
  await interaction.reply({ embeds: [embed] });
}

// /roll
const rollData = new SlashCommandBuilder()
  .setName("roll").setDescription("Roll a dice")
  .addIntegerOption((o) => o.setName("sides").setDescription("Number of sides (default 6)").setRequired(false).setMinValue(2).setMaxValue(1000));

async function rollExecute(interaction: ChatInputCommandInteraction) {
  const sides = interaction.options.getInteger("sides") ?? 6;
  const result = Math.floor(Math.random() * sides) + 1;
  const embed = new EmbedBuilder().setColor(0xff4500).setTitle("🎲 Dice Roll")
    .setDescription(`You rolled a **${result}** out of ${sides}`)
    .setFooter({ text: `Rolled by ${interaction.user.username}` });
  await interaction.reply({ embeds: [embed] });
}

// /roast
const roastData = new SlashCommandBuilder()
  .setName("roast").setDescription("Roast a member (all in good fun 😈)")
  .addUserOption((o) => o.setName("member").setDescription("Who to roast").setRequired(true));

const roasts = [
  "Your driving is so bad even the NPCs avoid you.",
  "You corner like a shopping trolley with a broken wheel.",
  "Your reaction time is slower than the game's loading screen.",
  "Even the bots drift better than you.",
  "You spin out on straight roads somehow.",
  "Your car build is what happens when you let a toddler pick parts.",
  "You show up late to every takeover and still crash first.",
  "Your top speed is someone else's reverse.",
  "You've been rammed off the road by people who weren't even trying.",
  "Your lines are so wide they'd get you kicked from a parking lot.",
  "The traffic AI has more mechanical sympathy than you do.",
  "You hit a wall on the tutorial.",
  "You drive like you're reading the map while steering with your elbows.",
];

async function roastExecute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("member", true);
  const embed = new EmbedBuilder().setColor(0xff4500).setTitle(`🔥 Roast: ${target.username}`)
    .setDescription(roasts[Math.floor(Math.random() * roasts.length)]!)
    .setThumbnail(target.displayAvatarURL())
    .setFooter({ text: `Roasted by ${interaction.user.username} • All in good fun` });
  await interaction.reply({ embeds: [embed] });
}

// /speed
const speedData = new SlashCommandBuilder().setName("speed").setDescription("Check your top speed in Midnight Chasers tonight");

function getSpeedRating(speed: number) {
  if (speed >= 220) return { label: "GODSPEED 👑", emoji: "🏆", color: 0xffd700 };
  if (speed >= 190) return { label: "Street Legend", emoji: "🔥", color: 0xff4500 };
  if (speed >= 160) return { label: "Takeover Ready", emoji: "🚗", color: 0x2ecc71 };
  if (speed >= 130) return { label: "Average Chaser", emoji: "💨", color: 0x3498db };
  if (speed >= 100) return { label: "Still Learning", emoji: "🐢", color: 0xf1c40f };
  return { label: "Stay in the Parking Lot", emoji: "😬", color: 0x99aab5 };
}

async function speedExecute(interaction: ChatInputCommandInteraction) {
  const speed = Math.floor(Math.random() * 180) + 60;
  const { label, emoji, color } = getSpeedRating(speed);
  const bar = Math.round((speed / 240) * 20);
  const embed = new EmbedBuilder().setColor(color)
    .setTitle(`${emoji} Speed Check — ${interaction.user.username}`)
    .addFields(
      { name: "Top Speed", value: `**${speed} mph**`, inline: true },
      { name: "Rating", value: label, inline: true },
      { name: "Speed Meter", value: `\`[${"█".repeat(bar)}${"░".repeat(20 - bar)}]\`` }
    )
    .setFooter({ text: "Midnight Chasers Speed Check" }).setTimestamp();
  await interaction.reply({ embeds: [embed] });
}

// /wyr
const wyrData = new SlashCommandBuilder().setName("wyr").setDescription("Would you rather... (Midnight Chasers edition)");

const wyrQuestions = [
  ["Drift every corner perfectly", "Hit 300mph on the straight"],
  ["Win a takeover solo", "Win a takeover with a full crew"],
  ["Drive a stock car that handles great", "Drive a maxed car with terrible handling"],
  ["Always be chased by cops", "Always lose traction in rain"],
  ["Never crash again", "Always have unlimited nitrous"],
  ["Be the fastest driver nobody knows", "Be the most famous driver who's mid"],
  ["Drive a tuned economy car", "Drive a stock supercar"],
  ["Host every takeover", "Never organise one but always get the private link"],
  ["Drift the entire map", "Do one perfect lap at max speed"],
];

async function wyrExecute(interaction: ChatInputCommandInteraction) {
  const [a, b] = wyrQuestions[Math.floor(Math.random() * wyrQuestions.length)]!;
  const embed = new EmbedBuilder().setColor(0x5865f2).setTitle("🤔 Would You Rather...")
    .addFields({ name: "🅰️ Option A", value: a! }, { name: "🅱️ Option B", value: b! })
    .setFooter({ text: "React with 🅰️ or 🅱️ to vote!" });
  const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
  await msg.react("🅰️");
  await msg.react("🅱️");
}

// /rps
const rpsData = new SlashCommandBuilder()
  .setName("rps").setDescription("Rock, paper, scissors vs the bot")
  .addStringOption((o) => o.setName("choice").setDescription("Your move").setRequired(true)
    .addChoices({ name: "🪨 Rock", value: "rock" }, { name: "📄 Paper", value: "paper" }, { name: "✂️ Scissors", value: "scissors" }));

type RpsChoice = "rock" | "paper" | "scissors";
const rpsChoices: RpsChoice[] = ["rock", "paper", "scissors"];
const rpsEmoji: Record<RpsChoice, string> = { rock: "🪨", paper: "📄", scissors: "✂️" };
function getRpsResult(p: RpsChoice, b: RpsChoice) {
  if (p === b) return "tie";
  if ((p === "rock" && b === "scissors") || (p === "paper" && b === "rock") || (p === "scissors" && b === "paper")) return "win";
  return "lose";
}

async function rpsExecute(interaction: ChatInputCommandInteraction) {
  const player = interaction.options.getString("choice", true) as RpsChoice;
  const bot = rpsChoices[Math.floor(Math.random() * rpsChoices.length)]!;
  const result = getRpsResult(player, bot);
  const embed = new EmbedBuilder()
    .setColor({ win: 0x2ecc71, lose: 0xe74c3c, tie: 0x95a5a6 }[result])
    .setTitle("✂️ Rock, Paper, Scissors")
    .addFields(
      { name: "Your pick", value: `${rpsEmoji[player]} ${player}`, inline: true },
      { name: "Bot's pick", value: `${rpsEmoji[bot]} ${bot}`, inline: true },
      { name: "Result", value: { win: "🎉 You win!", lose: "😔 You lose!", tie: "🤝 It's a tie!" }[result] }
    )
    .setFooter({ text: `Played by ${interaction.user.username}` });
  await interaction.reply({ embeds: [embed] });
}

// ─── COMMAND REGISTRY ────────────────────────────────────────────────────────

type Command = { data: { name: string; toJSON: () => unknown }; execute: (i: ChatInputCommandInteraction) => Promise<void> };

const commands = new Collection<string, Command>([
  ["setup_takeover",  { data: setupTakeoverData,  execute: setupTakeoverExecute  }],
  ["takeover_start",  { data: takeoverStartData,  execute: takeoverStartExecute  }],
  ["takeover_end",    { data: takeoverEndData,    execute: takeoverEndExecute    }],
  ["announce",        { data: announceData,       execute: announceExecute       }],
  ["role_give",       { data: roleGiveData,       execute: roleGiveExecute       }],
  ["role_remove",     { data: roleRemoveData,     execute: roleRemoveExecute     }],
  ["clear",           { data: clearData,          execute: clearExecute          }],
  ["8ball",           { data: eightBallData,      execute: eightBallExecute      }],
  ["coinflip",        { data: coinflipData,       execute: coinflipExecute       }],
  ["roll",            { data: rollData,           execute: rollExecute           }],
  ["roast",           { data: roastData,          execute: roastExecute          }],
  ["speed",           { data: speedData,          execute: speedExecute          }],
  ["wyr",             { data: wyrData,            execute: wyrExecute            }],
  ["rps",             { data: rpsData,            execute: rpsExecute            }],
]);

// ─── DEPLOY COMMANDS (run once with: DEPLOY=true npx tsx bot.ts) ─────────────

if (process.env["DEPLOY"] === "true") {
  if (!clientId) { logger.error("DISCORD_CLIENT_ID required for deploy"); process.exit(1); }
  const rest = new REST().setToken(token!);
  const body = [...commands.values()].map((c) => c.data.toJSON());
  logger.info(`Registering ${body.length} commands...`);
  const data = await rest.put(Routes.applicationCommands(clientId), { body }) as unknown[];
  logger.info(`Registered ${data.length} commands.`);
  process.exit(0);
}

// ─── BOT CLIENT ──────────────────────────────────────────────────────────────

const useGuildMembers = process.env["ENABLE_GUILD_MEMBERS_INTENT"] === "true";

function createClient() {
  return new Client({ intents: [GatewayIntentBits.Guilds, ...(useGuildMembers ? [GatewayIntentBits.GuildMembers] : [])] });
}

async function start() {
  const client = createClient();
  client.once(Events.ClientReady, (r) => logger.info(`Logged in as ${r.user.tag}`));
  client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) { await interaction.reply({ content: "Unknown command!", ephemeral: true }); return; }
    try {
      await command.execute(interaction);
    } catch (err) {
      logger.error({ err }, "Command error");
      const msg = { content: "There was an error executing this command!", ephemeral: true };
      if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }
  });
  client.on(Events.GuildMemberAdd, async (member: GuildMember) => {
    const role = member.guild.roles.cache.find((r) => r.name === "MC Member");
    if (!role) return;
    await member.roles.add(role).catch(() => null);
  });
  client.on(Events.Error, (e) => logger.error({ err: e }, "Client error"));
  client.on(Events.ShardDisconnect, (_e, shardId) => {
    logger.warn({ shardId }, "Disconnected — reconnecting in 5s");
    setTimeout(() => { client.destroy(); start().catch(() => null); }, 5000);
  });
  await client.login(token!);
}

start().catch(() => setTimeout(() => start(), 10_000));
