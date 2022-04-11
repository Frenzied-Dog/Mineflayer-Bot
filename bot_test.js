const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const v = require('vec3');
const ms = require("mineflayer-statemachine");
const inventoryViewer = require('mineflayer-web-inventory');

/*
config={host: '192.168.191.151',
        port: 25565,
        username: 'JustABot',
        version: '1.18.1'}
*/

config={host: 'localhost',
        port: 25565,
        username: 'JustABot',
        version: '1.18.1'}

const T = {}
const array = [ v(1,0,0), v(-1,0,0), v(0,1,0), v(0,-1,0), v(0,0,1),v(0,0,-1) ]

bot = mineflayer.createBot(config);

bot.once('spawn', ()=>{
  const mcData = require('minecraft-data')(bot.version);
  inventoryViewer(bot);
	bot.loadPlugin(require('mineflayer-collectblock').plugin);
});


bot.on('chat', async (username, message) => {
	if (username === bot.username) return;

	if (message === 'go') {
		await bot.equip(bot.inventory.items().filter(item => item.name === "cooked_cod")[0], "hand");
    await bot.consume().then( ()=> bot.chat("HI") );


    //const chest = await bot.openContainer(bot.blockAt(v(19,173,10)));

    // const allDebris = Object.values(bot.entities).filter(e => e.name==="item" && e.getDroppedItem().name === "ancient_debris");
    // T.droppedDebris = allDebris.sort( (a,b) => a.position.distanceTo(bot.entity.position)-b.position.distanceTo(bot.entity.position) )
    // console.log(T.droppedDebris);
		// console.log(Object.values(bot.entities).filter(e => e.name==="item" && e.getDroppedItem().name === "ancient_debris")[0]);

		// const target = bot.nearestEntity(entity => entity.name==="item" && entity.getDroppedItem().name === "ancient_debris");
  	// console.log(target);
		// await bot.collectBlock.collect(target);
	}

});
