// index.js
const { Client, GatewayIntentBits } = require("discord.js");
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
} = require("@discordjs/voice");
const ytdlp = require("yt-dlp-exec");
const { spawn } = require("child_process");
require("dotenv").config();

// ---- Create Bot Client ----
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// ---- Bot Ready Event ----
client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}! Bot is online and ready.`);
});

// ---- Message Handler ----
client.on("messageCreate", async (message) => {
  if (!message.content.startsWith("!")) return;

  const args = message.content.trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // ---------------- !play command ----------------
  if (command === "!play") {
    const voiceChannel = message.member?.voice.channel;
    if (!voiceChannel) {
      return message.reply("❌ You must be in a voice channel first!");
    }

    if (!args.length) {
      return message.reply("❌ Please provide a YouTube link!");
    }

    const url = args[0];

    // fetch video info from yt-dlp
    let info;
    try {
      info = await ytdlp(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        preferFreeFormats: true,
        addHeader: ["referer:youtube.com", "user-agent:googlebot"],
      });
    } catch (err) {
      console.error(err);
      return message.reply("❌ Failed to fetch video info!");
    }

    const audioUrl =
      info.url || info.formats?.find((f) => f.acodec !== "none")?.url;
    if (!audioUrl) return message.reply("❌ No audio format found!");

    // join voice channel
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    });

    // ffmpeg stream
    const ffmpeg = spawn("ffmpeg", [
      "-reconnect",
      "1",
      "-reconnect_streamed",
      "1",
      "-reconnect_delay_max",
      "5",
      "-i",
      audioUrl,
      "-analyzeduration",
      "0",
      "-loglevel",
      "0",
      "-f",
      "s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      "pipe:1",
    ]);

    const resource = createAudioResource(ffmpeg.stdout);
    const player = createAudioPlayer();

    player.play(resource);
    connection.subscribe(player);

    message.reply(`🎶 Now playing: **${info.title}**`);

    player.on(AudioPlayerStatus.Idle, () => {
      ffmpeg.kill("SIGKILL");
      connection.destroy();
    });

    player.on("error", (error) => {
      console.error(error);
      message.reply("⚠️ Error playing audio.");
      ffmpeg.kill("SIGKILL");
      connection.destroy();
    });
  }

  // ---------------- !ping command (test) ----------------
  if (command === "!ping") {
    message.reply("🏓 Pong!");
  }
});

// ---- Login with Token ----
client.login(process.env.TOKEN);
