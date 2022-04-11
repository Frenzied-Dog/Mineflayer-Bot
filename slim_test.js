const mineflayer = require('mineflayer');
const v = require('vec3');
const inventoryViewer = require('mineflayer-web-inventory');
const StatemachineSetup = require('./Create_Statemachice')

config={host: 'localhost',
				port: 25565,
				username: 'JustABot',
				version: '1.18.1'};

const T = { mode: null, error: null,
						mineCenter: v(0,0,0), axis: v(0,0,0), m: 0,
						bones: 0, nowBone: v(0,0,0), c: 0, mineFaced: v(0,0,0),
						lava: false, searchName: "", positions:{ lava:[], ancient_debris:[] },
						willSearch:{ lava:[], ancient_debris:[] }, droppedDebris: null,
						withdrawItemName: null, placeTorch: false };

bot = mineflayer.createBot(config);

bot.once('spawn', ()=> {
	const mcData = require('minecraft-data')(bot.version);
	inventoryViewer(bot);
	bot.loadPlugin(require('mineflayer-collectblock').plugin);

	StatemachineSetup(bot,T);
});

bot.on("chat", (username, message) => {
	if (username === bot.username) return;

	switch(message) {
		case "mine":
			bot.chat('Ready!');
			T.mineCenter = v(1,14,-9); T.axis = v(-1,0,0);
			T.m = 0; T.bones = 0; T.nowBone = v(0,0,0); T.c = 0; T.mineFaced = v(0,0,0); // for test
			T.mode = message;
			break;
		case "stop":
			bot.chat('STOP');
			T.mode = null;
			break;
		case "resume":
			bot.chat('go');
			T.mode = "mine";
			break;
	}
});

bot.once("death", () => bot.once("spawn", () => bot.quit() ) );