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

  function createMineBlockState() {
    const MineingState = ( function(){
      function MyState(bot, targets)
      {
          this.bot = bot;
          this.active = false;
          this.stateName = 'mineingState';
          this.targets = targets;
          this.error = false;
          this.isFinished = false;
      }

      MyState.prototype.onStateEntered = () => {
        this.isFinished = false;  
        this.bot.dig(this.bot.blockAt(this.targets.position)).catch(err => {
          console.log(err);
          this.error = true;
        });
      };

      return MyState;
    }());

    const FindingState = ( function(){
      function MyState(bot, targets)
      {
          this.bot = bot;
          this.active = false;
          this.stateName = 'FindingState';
          this.targets = targets;
      }

      MyState.prototype.onStateEntered = function() {
        if ( this.targets.positions === undefined ) this.targets.positions = [];
        if ( this.targets.positions[this.targets.name] === undefined ) this.targets.positions[this.targets.name] = [];
        array.some( (item) => {
          const searching = this.targets.position.plus(item);
          if ( this.bot.blockAt(searching).name == this.targets.name ){
            this.targets.positions[this.targets.name].push(searching);
          }
        });
      };

      return MyState;
    }());

    const enter = new ms.BehaviorIdle();
    const exit = new ms.BehaviorIdle();
    const equipIronPickaxe = new ms.BehaviorEquipItem(bot,T);
    const equipDiamondPickaxe = new ms.BehaviorEquipItem(bot,T);
    const breakBlock = new MineingState(bot,T);
    const checkLava = new FindingState(bot,T);
    const placeBlock = new ms.BehaviorPlaceBlock(bot,T);
    const errorState = new ms.BehaviorIdle();
    const checkDebris = new FindingState(bot,T);

    const transitions = [
      new ms.StateTransition({
        parent: enter,
        child: equipIronPickaxe,
        shouldTransition: () => bot.blockAt(T.position).name !== "ancient_debris",
        onTransition: () => {
          T.lava = false
          const pickaxes = bot.inventory.items().filter( i => i.name === "iron_pickaxe" )
          T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0]
        },
      }),

      new ms.StateTransition({
        parent: enter,
        child: equipDiamondPickaxe,
        shouldTransition: () => bot.blockAt(T.position).name === "ancient_debris",
        onTransition: () => {
          T.lava = false
          const pickaxes = bot.inventory.items().filter( i => i.name === "diamond_pickaxe" )
          T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0]
        },
      }),

      new ms.StateTransition({
        parent: equipIronPickaxe,
        child: breakBlock,
        shouldTransition: () => true,
        onTransition: () => {
          bot.once("diggingCompleted", ()=> {
            breakBlock.isFinished = true
            bot.chat("block breaked")
          });
        }
      }),

      new ms.StateTransition({
        parent: equipDiamondPickaxe,
        child: breakBlock,
        shouldTransition: () => true,
        onTransition: () => {
          bot.once("diggingCompleted", ()=> {
            breakBlock.isFinished = true
            bot.chat("block breaked")
          });
          T.position = T.positions.ancient_debris.shift();
        }
      }),

      new ms.StateTransition({
        parent: breakBlock,
        child: checkLava,
        shouldTransition: () => breakBlock.isFinished,
        onTransition: () => T.name = "lava",
      }),

      new ms.StateTransition({
        parent: checkLava,
        child: placeBlock,
        shouldTransition: () => T.positions.lava.length !== 0,
        onTransition: () => {
          bot.once("blockPlaced", onPlaced);
          function onPlaced(oldBlock, newBlock) {
            placeBlock.isFinished = true;
          }
          getPlaceFace(bot,T);
        },
      }),

      new ms.StateTransition({
        parent: placeBlock,
        child: placeBlock,
        shouldTransition: () => placeBlock.isFinished && T.positions.lava.length !== 0,
        onTransition: () => {
          bot.once("blockPlaced", onPlaced);
          function onPlaced(oldBlock, newBlock) {
            placeBlock.isFinished = true;
          }
          getPlaceFace(bot,T);
        },
      }),

      new ms.StateTransition({
        parent: placeBlock,
        child: errorState,
        shouldTransition: () => placeBlock.error,
        onTransition: () => T.lava = true,
      }),

      new ms.StateTransition({
        parent: placeBlock,
        child: checkDebris,
        shouldTransition: () => placeBlock.isFinished && T.positions.lava.length === 0,
        onTransition: () => {
          T.name = "ancient_debris"
          T.position = T.nowMinePos
        },
      }),

      new ms.StateTransition({
        parent: checkLava,
        child: checkDebris,
        shouldTransition: () => T.positions.lava.length === 0,
        onTransition: () => T.name = "ancient_debris",
      }),

      new ms.StateTransition({
        parent: checkDebris,
        child: exit,
        shouldTransition: () => T.positions.ancient_debris.length === 0,
      }),

      new ms.StateTransition({
        parent: checkDebris,
        child: equipDiamondPickaxe,
        shouldTransition: () => T.positions.ancient_debris.length !== 0,
        onTransition: () => {
          const pickaxes = bot.inventory.items().filter( i => i.name === "diamond_pickaxe" )
          T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0]
        }
      }),
    ];

    function getPlaceFace(bot,targets){
      let way = v(1,0,0);
      targets.position = targets.positions.lava.shift();
      array.some( (i) => {
        if ( !["water", "lava", "air"].includes(bot.blockAt(targets.position.plus(i)).name)){
          way = i;
          return true;
        }
      });

      targets.position.add(way);
      targets.blockFace = way.scaled(-1);        
      targets.item = bot.inventory.items().filter(item => item.name === "netherrack")[0];
      if (targets.item===undefined) targets.item = bot.inventory.items().filter(item => item.name === "basalt")[0];
    }

    return new ms.NestedStateMachine(transitions, enter, exit);
  }


  const idleState = new ms.BehaviorIdle();
  const breakBlock = new createMineBlockState();
  const transitions = [
    new ms.StateTransition({
      parent: idleState,
      child: breakBlock,
      shouldTransition: () => T.mode === "mine",
      onTransition: () => {
        T.position = v(6,174,-5);
        T.nowMinePos = T.position;
      },
    }),

    new ms.StateTransition({
      parent: breakBlock,
      child: idleState,
      shouldTransition: () => breakBlock.isFinished(),
      onTransition: () => {
        T.mode = "none"
        bot.chat("finish")
      }
    }),

    new ms.StateTransition({
      parent: breakBlock,
      child: idleState,
      shouldTransition: () => T.lava,
      onTransition: () => {
        T.mode = "none"
        bot.chat("error")
      }
    }),
  ]

  const rootLayer = new ms.NestedStateMachine(transitions, idleState);
  
  // We can start our state machine simply by creating a new instance.
  const stateMachine = new ms.BotStateMachine(bot, rootLayer);
  const webserver = new ms.StateMachineWebserver(bot, stateMachine,13579);
  webserver.startServer();
  
});

bot.on("chat", (username, message) => {
  if (username === bot.username) return;

  switch(message) {
    case "check":
      bot.chat('Ready!');
      T.mode = "check";
      break;
    case "deposit":
      bot.chat('Deposit!')
      T.mode = "deposit"  
      break;
    case "withdraw":
      bot.chat('Withdraw!')
      T.mode = "withdraw"
      break;
    case "mine":
      bot.chat("Mine!")
      T.mode = "mine"
      T.position = v(6,174,-5)
  }
});