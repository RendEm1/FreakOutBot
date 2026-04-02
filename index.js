const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs/promises');
const express = require('express');

// CONFIG
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const OWNER_ID = "715316760462491673";
const ALLOWED_CHANNEL_ID = "1488832547864580126";

// DATA
let balances = {};
let nominations = {};

// LOAD
async function loadData() {
    try {
        const data = JSON.parse(await fs.readFile("data.json", "utf8"));
        balances = data.balances || {};
        nominations = data.nominations || {};
    } catch {
        console.log("No data file yet");
    }
}

// SAVE
async function saveData() {
    try {
        await fs.writeFile(
            "data.json",
            JSON.stringify({ balances, nominations }, null, 2)
        );
    } catch (err) {
        console.log("Save failed:", err.message);
    }
}

function getBalance(userId) {
    if (!balances[userId]) balances[userId] = 500;
    return balances[userId];
}

// CLIENT
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// READY
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);

    setInterval(() => {
        console.log("heartbeat");
    }, 10000);
});

// COMMANDS
client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
        return interaction.reply({ content: "Wrong channel.", ephemeral: true });
    }

    const userId = interaction.user.id;
    const name = interaction.commandName;

    getBalance(userId);

    if (name === "leaderboard") {
        const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);

        let msg = "**Leaderboard**\n\n";
        for (const [id, bal] of sorted) {
            msg += `<@${id}> — ${bal}\n`;
        }

        return interaction.reply(msg);
    }
});

// REGISTER
const commands = [
    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show balances")
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await loadData();
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Commands registered.");
})();

// EXPRESS
const app = express();

app.get("/", (req, res) => {
    res.send("Bot alive");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Web server running on port", PORT);
});

// LOGIN
client.login(TOKEN)
