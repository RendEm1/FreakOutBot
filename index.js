const { Client, GatewayIntentBits, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs/promises');
const express = require('express');

// ================= CONFIG =================
const TOKEN = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const OWNER_ID = "715316760462491673";
const ALLOWED_CHANNEL_ID = "1488832547864580126";

// ================= DATA =================
let balances = {};
let nominations = {};

// ================= LOAD / SAVE =================
async function loadData() {
    try {
        const data = JSON.parse(await fs.readFile("data.json", "utf8"));
        balances = data.balances || {};
        nominations = data.nominations || {};
        console.log("Data loaded");
    } catch {
        console.log("No data file yet, starting fresh");
    }
}

// SAFE SAVE (won’t freeze forever)
async function saveData() {
    try {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Save timeout")), 5000)
        );

        await Promise.race([
            fs.writeFile(
                "data.json",
                JSON.stringify({ balances, nominations }, null, 2)
            ),
            timeout
        ]);
    } catch (err) {
        console.log("Save failed:", err.message);
    }
}

// ================= SAVE QUEUE =================
let saveQueued = false;

function queueSave() {
    if (saveQueued) return;
    saveQueued = true;

    setTimeout(async () => {
        saveQueued = false;
        await saveData();
    }, 3000);
}

// ================= HELPERS =================
function getBalance(userId) {
    if (!balances[userId]) balances[userId] = 500;
    return balances[userId];
}

// ================= CLIENT =================
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// ================= READY =================
client.once("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);

    setInterval(() => {
        console.log("heartbeat", Date.now());
    }, 10000);
});

// ================= FREEZE WATCHDOG =================
let lastTick = Date.now();

setInterval(() => {
    lastTick = Date.now();
}, 10000);

setInterval(() => {
    if (Date.now() - lastTick > 30000) {
        console.log("FROZEN - restarting bot");
        process.exit(1);
    }
}, 15000);

// ================= COMMAND HANDLER =================
client.on("interactionCreate", async interaction => {
    try {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.channelId !== ALLOWED_CHANNEL_ID) {
            return interaction.reply({ content: "Wrong channel.", ephemeral: true });
        }

        const userId = interaction.user.id;
        const name = interaction.commandName;

        getBalance(userId);

        if (name === "nominate") {
            const player = interaction.options.getString("player");
            const amount = interaction.options.getInteger("amount");

            if (amount < 20) return interaction.reply("Min bet is 20.");
            if (balances[userId] < amount) return interaction.reply("Not enough abz bucks.");

            balances[userId] -= amount;

            if (!nominations[player]) nominations[player] = [];
            nominations[player].push({ userId, amount });

            queueSave();
            return interaction.reply(`${interaction.user.username} bet ${amount} on "${player}"`);
        }

        if (name === "winner") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            const player = interaction.options.getString("player");
            const bets = nominations[player];

            if (!bets || bets.length === 0) return interaction.reply("No bets.");

            const totalPool = Object.values(nominations).flat()
                .reduce((sum, b) => sum + b.amount, 0);

            const winnerTotal = bets.reduce((sum, b) => sum + b.amount, 0);
            const profitPool = totalPool - winnerTotal;
            const split = bets.length ? profitPool / bets.length : 0;

            for (const bet of bets) {
                getBalance(bet.userId);
                balances[bet.userId] += bet.amount + split;
            }

            nominations = {};
            queueSave();

            return interaction.reply(`${player} wins! Pool: ${totalPool}`);
        }

        if (name === "leaderboard") {
            const sorted = Object.entries(balances).sort((a, b) => b[1] - a[1]);

            let msg = "**ABZ Bucks Leaderboard**\n\n";
            for (const [id, bal] of sorted) {
                msg += `<@${id}> — ${bal}\n`;
            }

            return interaction.reply(msg);
        }

        if (name === "transfer") {
            const target = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");

            if (!target) return interaction.reply("Invalid user.");
            if (amount <= 0) return interaction.reply("Invalid amount.");
            if (balances[userId] < amount) return interaction.reply("Not enough.");

            getBalance(target.id);

            balances[userId] -= amount;
            balances[target.id] += amount;

            queueSave();
            return interaction.reply(`Sent ${amount} to ${target.username}`);
        }

        if (name === "weekly") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            for (const id in balances) {
                balances[id] += 10;
            }

            queueSave();
            return interaction.reply("Everyone got +10.");
        }

        if (name === "clearnominees") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            nominations = {};
            queueSave();

            return interaction.reply("Cleared.");
        }

    } catch (err) {
        console.log("Command error:", err);
    }
});

// ================= COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("nominate")
        .setDescription("Bet system")
        .addStringOption(o =>
            o.setName("player").setDescription("Name").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setDescription("Min 20").setRequired(true)),

    new SlashCommandBuilder()
        .setName("winner")
        .setDescription("Owner only")
        .addStringOption(o =>
            o.setName("player").setDescription("Winner").setRequired(true)),

    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show balances"),

    new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Send money")
        .addUserOption(o =>
            o.setName("user").setDescription("User").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setDescription("Amount").setRequired(true)),

    new SlashCommandBuilder()
        .setName("weekly")
        .setDescription("Owner add +10"),

    new SlashCommandBuilder()
        .setName("clearnominees")
        .setDescription("Clear bets")
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    await loadData();
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("Commands registered.");
})();

// ================= EXPRESS =================
const app = express();

app.get("/", (req, res) => {
    res.send("Bot alive");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log("Web server running on port", PORT);
});

// ================= LOGIN =================
client.login(TOKEN);                .reduce((sum, b) => sum + b.amount, 0);

            const winnerTotal = bets.reduce((sum, b) => sum + b.amount, 0);
            const profitPool = totalPool - winnerTotal;

            const split = bets.length ? profitPool / bets.length : 0;

            for (const bet of bets) {
                if (!balances[bet.userId]) balances[bet.userId] = 500;
                balances[bet.userId] += bet.amount + split;
            }

            nominations = {};
            await saveData();

            return interaction.reply(`${player} wins! Pool: ${totalPool}`);
        }

        // ===== LEADERBOARD =====
        if (cmd === "leaderboard") {
            const sorted = Object.entries(balances)
                .sort((a, b) => b[1] - a[1]);

            let msg = "**ABZ Bucks Leaderboard**\n\n";

            for (const [id, bal] of sorted) {
                msg += `<@${id}> — ${bal}\n`;
            }

            return interaction.reply(msg);
        }

        // ===== TRANSFER =====
        if (cmd === "transfer") {
            const target = interaction.options.getUser("user");
            const amount = interaction.options.getInteger("amount");

            if (!target || amount <= 0) return interaction.reply("Invalid input.");
            if (balances[userId] < amount) return interaction.reply("Not enough.");

            if (!balances[target.id]) balances[target.id] = 500;

            balances[userId] -= amount;
            balances[target.id] += amount;

            await saveData();

            return interaction.reply(`Sent ${amount} to ${target.username}`);
        }

        // ===== WEEKLY =====
        if (cmd === "weekly") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            for (const id in balances) {
                balances[id] += 10;
            }

            await saveData();
            return interaction.reply("Everyone got +10.");
        }

        // ===== CLEAR =====
        if (cmd === "clearnominees") {
            if (userId !== OWNER_ID) return interaction.reply("Owner only.");

            nominations = {};
            await saveData();

            return interaction.reply("Cleared.");
        }

    } catch (err) {
        console.log("Command error:", err);
    }
});

// ================= COMMANDS =================
const commands = [
    new SlashCommandBuilder()
        .setName("nominate")
        .setDescription("Bet on a player")
        .addStringOption(o =>
            o.setName("player").setDescription("Player name").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setDescription("Min 20").setRequired(true)),

    new SlashCommandBuilder()
        .setName("winner")
        .setDescription("Declare winner (owner only)")
        .addStringOption(o =>
            o.setName("player").setDescription("Winner").setRequired(true)),

    new SlashCommandBuilder()
        .setName("leaderboard")
        .setDescription("Show abz bucks leaderboard"),

    new SlashCommandBuilder()
        .setName("transfer")
        .setDescription("Send abz bucks")
        .addUserOption(o =>
            o.setName("user").setDescription("User").setRequired(true))
        .addIntegerOption(o =>
            o.setName("amount").setDescription("Amount").setRequired(true)),

    new SlashCommandBuilder()
        .setName("weekly")
        .setDescription("Give everyone +10 (owner only)"),

    new SlashCommandBuilder()
        .setName("clearnominees")
        .setDescription("Clear all bets")
].map(c => c.toJSON());

// ================= REGISTER =================
const rest = new REST({ version: "10" }).setToken(TOKEN);

(async () => {
    try {
        await loadData();

        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );

        console.log("Commands registered.");
    } catch (err) {
        console.log("Command register failed:", err);
    }
})();

// ================= EXPRESS (RENDER FIX) =================
const app = express();

app.get("/", (req, res) => {
    res.send("bot alive");
});

// THIS LINE FIXES YOUR BOT DYING
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Web server running on port", PORT);
});

// ================= LOGIN =================
client.login(TOKEN);
