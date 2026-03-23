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
    .addChoices({ name: "OG", value: "OG" }, { name: "Takeover Host", value: "Takeover Host" }, { name: "Moderator", value: "Moderator" }, { name: "MC Member", value: "
