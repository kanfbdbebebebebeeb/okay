import {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  Collection,
  ChatInputCommandInteraction,
  GuildMember,
} from "discord.js";
import pino from "pino";

const logger = pino({ transport: { target: "pino-pretty" } });

// ====== ENV ======
const token = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID || process.env.CLIENT_ID;
if (!token) { logger.error("Discord token required"); process.exit(1); }

// ====== COMMAND SYSTEM ======
type Command = { data: SlashCommandBuilder; execute: (i: ChatInputCommandInteraction) => Promise<void> };
const commands = new Collection<string, Command>();

function register(command: Command) {
  commands.set(command.data.name, command);
}

// ===================== COMMANDS =====================

// -- /setup_takeover
const setupTakeoverData = new SlashCommandBuilder()
  .setName("setup_takeover")
  .setDescription("Wipe and rebuild the MC Takeovers server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function nukeServer(guild: any) {
  await Promise.all([...guild.channels.cache.values()].map(ch => ch.delete().catch(() => null)));
  const botPos = guild.members.me?.roles.highest.position ?? 0;
  const roles = [...guild.roles.cache.values()].filter(r => !r.managed && r.name !== "@everyone" && r.position < botPos);
  await Promise.all(roles.map(r => r.delete().catch(() => null)));
}

async function setupTakeoverExecute(i: ChatInputCommandInteraction) {
  const guild = i.guild;
  if (!guild) return i.reply({ content: "Server only.", ephemeral: true });
  await i.reply({ content: "🗑️ Wiping channels and roles...", ephemeral: true });
  try {
    await nukeServer(guild);
    await new Promise(r => setTimeout(r, 2000));
    const og = await guild.roles.create({ name: "OG", color: 0xffd700, hoist: true, mentionable: true });
    const host = await guild.roles.create({ name: "Takeover Host", color: 0xff4500, hoist: true, mentionable: true });
    const mod = await guild.roles.create({ name: "Moderator", color: 0x1e90ff, hoist: true, mentionable: true });
    const member = await guild.roles.create({ name: "MC Member", color: 0x2ecc71 });
    const ev = guild.roles.everyone;

    // Categories & channels
    const infoCat = await guild.channels.create({ name: "📌 INFO", type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: ev.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: host.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
        { id: mod.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] },
      ],
    });
    await guild.channels.create({ name: "takeover-rules", type: ChannelType.GuildText, parent: infoCat.id });
    await guild.channels.create({ name: "announcements", type: ChannelType.GuildText, parent: infoCat.id });

    const genCat = await guild.channels.create({ name: "💬 GENERAL", type: ChannelType.GuildCategory });
    await guild.channels.create({ name: "general", type: ChannelType.GuildText, parent: genCat.id });
    await guild.channels.create({ name: "clips-and-media", type: ChannelType.GuildText, parent: genCat.id });

    const takeCat = await guild.channels.create({ name: "🚗 TAKEOVERS", type: ChannelType.GuildCategory });
    await guild.channels.create({ name: "takeover-events", type: ChannelType.GuildText, parent: takeCat.id });
    await guild.channels.create({ name: "locations", type: ChannelType.GuildText, parent: takeCat.id });
    await guild.channels.create({ name: "Takeover VC", type: ChannelType.GuildVoice, parent: takeCat.id });

    await i.followUp({ content: "✅ Server rebuilt!", ephemeral: true });
  } catch (err) {
    logger.error(err);
    await i.followUp({ content: "Error during setup.", ephemeral: true });
  }
}
register({ data: setupTakeoverData, execute: setupTakeoverExecute });

// -- /takeover_start
const takeoverStartData = new SlashCommandBuilder()
  .setName("takeover_start")
  .setDescription("Post a Midnight Chasers takeover event")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
  .addStringOption(o => o.setName("theme").setDescription("Theme/name").setRequired(true))
  .addStringOption(o => o.setName("location").setDescription("In-game location").setRequired(true))
  .addStringOption(o => o.setName("date").setDescription("Date").setRequired(true))
  .addStringOption(o => o.setName("time").setDescription("Start time").setRequired(true))
  .addStringOption(o => o.setName("private_server").setDescription("Private server link"))
  .addStringOption(o => o.setName("details").setDescription("Extra details"));

async function takeoverStartExecute(i: ChatInputCommandInteraction) {
  const theme = i.options.getString("theme", true);
  const location = i.options.getString("location", true);
  const date = i.options.getString("date", true);
  const time = i.options.getString("time", true);
  const privateServer = i.options.getString("private_server");
  const details = i.options.getString("details");
  const embed = new EmbedBuilder()
    .setColor(0xff4500)
    .setTitle(`🚗 MIDNIGHT CHASERS TAKEOVER — ${theme.toUpperCase()}`)
    .setDescription("A new takeover event has been announced!")
    .addFields({ name: "📅 Date", value: date, inline: true }, { name: "🕐 Time", value: time, inline: true }, { name: "📍 Location", value: location });
  if (details) embed.addFields({ name: "📋 Details", value: details });
  if (privateServer) embed.addFields({ name: "🎮 Private Server", value: `[Join](${privateServer})` });
  await i.reply({ embeds: [embed] });
}
register({ data: takeoverStartData, execute: takeoverStartExecute });

// ===================== OTHER COMMANDS =====================
// Here you would add the rest: takeover_end, announce, role_give, role_remove,
// clear, 8ball, coinflip, roll, roast, speed, wyr, rps
// They all follow the same pattern: register({data: ..., execute: ...});

// ===================== DEPLOY =====================
if (process.env.DEPLOY === "true") {
  if (!clientId) { logger.error("CLIENT_ID missing"); process.exit(1); }
  const rest = new REST().setToken(token);
  const body = [...commands.values()].map(c => c.data.toJSON());
  rest.put(Routes.applicationCommands(clientId), { body }).then(() => {
    logger.info(`Registered ${body.length} commands`);
    process.exit(0);
  }).catch(err => { logger.error(err); process.exit(1); });
}

// ===================== CLIENT =====================
client.once(Events.ClientReady, c => logger.info(`Logged in as ${c.user.tag}`));

client.on(Events.InteractionCreate, async i => {
  if (!i.isChatInputCommand()) return;
  const command = commands.get(i.commandName);
  if (!command) return i.reply({ content: "Unknown command!", ephemeral: true });
  try { await command.execute(i); } catch (err) { logger.error(err); if (i.replied) await i.followUp({ content: "Error", ephemeral: true }); else await i.reply({ content: "Error", ephemeral: true }); }
});

client.on(Events.GuildMemberAdd, async member => {
  const role = member.guild.roles.cache.find(r => r.name === "MC Member");
  if (role) await member.roles.add(role).catch(() => null);
});

client.on(Events.Error, e => logger.error(e));
client.on(Events.ShardDisconnect, (_e, shardId) => {
  logger.warn({ shardId }, "Disconnected — reconnecting in 5s");
  setTimeout(() => { client.destroy(); client.login(token); }, 5000);
});

// ===================== START =====================
client.login(token).catch(() => setTimeout(() => client.login(token), 10000));
