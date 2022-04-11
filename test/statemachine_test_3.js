const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const v = require('vec3');
const ms = require("mineflayer-statemachine");

/*
config={host: '192.168.191.151',
				port: 25566,
				username: 'JustABot',
				version: '1.18.1'}
*/

const LeftOf = (vec) => v(vec.z,0,-vec.x);
const RightOf = (vec) => v(-vec.z,0,vec.x);
const BackOf = (vec) => vec.scaled(-1);

config={host: 'localhost',
				port: 25566,
				username: 'JustABot',
				version: '1.18.1'}

const T = {}
const array = [ v(1,0,0), v(-1,0,0), v(0,1,0), v(0,-1,0), v(0,0,1),v(0,0,-1) ]

bot = mineflayer.createBot(config);

bot.once('spawn', ()=>{
	const mcData = require('minecraft-data')(bot.version)
	bot.loadPlugin(pathfinder);
	bot.loadPlugin(require('mineflayer-collectblock').plugin);

	const PickupState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'pickupState';
			this.targets = targets;
			this.error = false;
			this.isFinished = false; }

		MyState.prototype.onStateEntered = async function() {
			this.isFinished = false;
			try {
				await bot.collectBlock.collect(bot.nearestEntity(entity => entity.name==="item" && entity.getDroppedItem().name === "ancient_debris"));
			} catch (err) {
				console.log(err);
				this.error = true;
			}
		};

		return MyState;
	}());

	const idleState = new ms.BehaviorIdle();
	const moveTo = new ms.BehaviorMoveTo(bot,T);
	const collect = new PickupState(bot,T);

  const transitions = [
    new ms.StateTransition({
      parent: idleState,
      child: moveTo,
      shouldTransition: () => T.mode === "go",
      onTransition: () => {
      	T.position = v(20,179,15);
      	// bot.on("playerCollect", OnCollect)

      	// function OnCollect(collector, collected) {
      	// 	if (collector !== bot.entity) return;
      	// 	if (collected.getDroppedItem().name === "ancient_debris"){
      	// 		 bot.removeListener("playerCollect", OnCollect);
      	// 		 collect.isFinished = true;
      	// 	}
      	// }
        // T.position = bot.nearestEntity(entity => entity.name==="item" && entity.getDroppedItem().name === "ancient_debris").position;
      },
    }),

    new ms.StateTransition({
      parent: moveTo,
      child: idleState,
      shouldTransition: () => moveTo.isFinished(),
      onTransition: () => {
        T.mode = "none"
        bot.chat("finish")
        // console.log(checking)
      }
    }),

  ]

  const rootLayer = new ms.NestedStateMachine(transitions, idleState);
  
  // We can start our state machine simply by creating a new instance.
  const stateMachine = new ms.BotStateMachine(bot, rootLayer);
  const webserver = new ms.StateMachineWebserver(bot, stateMachine,13579);
  webserver.startServer();
 
});

let checking=[];

bot.on("blockUpdate", (oldBlock,newBlock) => {
	if (!checking.some((i)=> i.equals(oldBlock.position)) && oldBlock.name!=="air" && newBlock.name==="air" && oldBlock.position.distanceTo(bot.entity.position) < 3){
		checking.push(oldBlock.position);
	}
})


bot.on('chat', async (username, message) => {
	if (username === bot.username) return;

	if (message === 'go') {
		checking = [];
		T.mode = message;
	}

});