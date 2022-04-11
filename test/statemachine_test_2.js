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

  const FindLavaState = ( function(){
    function MyState(bot, targets)
    {
        this.bot = bot;
        this.active = false;
        this.stateName = 'FindLavaState';
        this.targets = targets
    }

    MyState.prototype.onStateEntered = function () {
      if ( this.targets.positions === undefined ) this.targets.positions = []
      array.some( (item) => {
        let searching = this.targets.position.plus(item)
        if ( this.bot.blockAt(searching).name == "lava" ){
          this.targets.positions.push(searching);
        }
      });
    };

    return MyState;
  }());

  const DepositState = ( function(){
    function MyState(bot, targets)
    {
        this.bot = bot;
        this.active = false;
        this.stateName = 'DepositState';
        this.targets = targets
        this.isFinished = false
    }

    MyState.prototype.onStateEntered = async function () {
      this.bot.chat("start")
      const chest = await this.bot.openChest(this.bot.blockAt(this.targets.position)); //v(11,173,-9)

      if (chest.firstEmptyContainerSlot() == null) {
        this.bot.chat("Chest already Full");
        chest.close();
        this.isFinished = true;
      } else {
        item = mcData.itemsByName[this.targets.item]
        await chest.deposit(item.id,null,Math.floor(this.bot.inventory.count(item.id)/64)*64).then(
          () => chest.close()
        ).catch(err => {
          if (err.message === "destination full") {
            bot.chat("Chest Full !!!")
            chest.close()
          }
        });
        this.isFinished = true;
      }
    };

    return MyState;
  }());


  const WithdrawState = ( function(){
    function MyState(bot, targets)
    {
        this.bot = bot;
        this.active = false;
        this.stateName = 'WithdrawState';
        this.targets = targets
        this.isFinished = false
    }

    MyState.prototype.onStateEntered = async function () {
      this.bot.chat("start")
      const chest = await this.bot.openChest(this.bot.blockAt(this.targets.position)); //v(10,173,-9)
      const item=mcData.itemsByName[this.targets.item]
      if (chest.containerCount(item.id) == 0) {
        this.bot.chat("Chest empty !!!");
        chest.close();
        this.isFinished = true;
      } else {
        await chest.withdraw(item.id,null,3).then(
          () => chest.close()
        ).catch(err => {
          console.log(err.message)
          if (err.message.includes("Can't find "+item.name+" in slots [0 - 27]")) {
            bot.chat("out of "+item.displayName)
            chest.close()
          }
        });
        this.isFinished = true;
      }
    };

    return MyState;
  }());


  //ancient_debris ; iron_pickaxe ; diamond_pickaxe ; torch ; cooked_cod 鱈魚
  const idleState = new ms.BehaviorIdle();
  const checkLava = new FindLavaState(bot,T);
  const placeBlock = new ms.BehaviorPlaceBlock(bot,T);
  const depositDebris = new DepositState(bot,T);
  const tossRack = new ms.BehaviorInteractBlock(bot,T)
  const withdrawPickaxe = new WithdrawState(bot,T);
  const withdrawTorch = new WithdrawState(bot,T);
  const withdrawFood = new WithdrawState(bot,T);
  const breakBlock = new ms.BehaviorMineBlock(bot,T);

  const mineCenter = v(3,173,-5)

  transitions = [
    new ms.StateTransition({
      parent: idleState,
      child: checkLava,
      shouldTransition: () => T.mode == "check",
      onTransition: () => { T.position=v(6,174,-5); T.error = false},
    }),

    new ms.StateTransition({
      parent: checkLava,
      child: idleState,
      shouldTransition: () => T.positions.length === 0,
      onTransition: () => {
        T.mode = null;
        console.log("no lava");
        console.log(T.position)
      }
    }),

    new ms.StateTransition({
      parent: checkLava,
      child: placeBlock,
      shouldTransition: () => T.positions.length !== 0,
      onTransition: async () => {
        bot.once("blockPlaced", onPlaced);
        function onPlaced(oldBlock, newBlock) {
          placeBlock.isFinished = true
        }

        let way = v(1,0,0)
        T.position = T.positions.shift()
        array.some( (i) => {
          if ( !["water", "lava", "air"].includes(bot.blockAt(T.position.plus(i)).name)){
            way = i
            return true;
          }
        });

        T.position.add(way);
        T.blockFace = way.scaled(-1);        
        T.item = bot.inventory.items().filter(item => item.name === "netherrack")[0];
        if (T.item===undefined) T.item = bot.inventory.items().filter(item => item.name === "basalt")[0];
      }
    }),  

    new ms.StateTransition({
      parent: placeBlock,
      child: checkLava,
      shouldTransition: () => placeBlock.isFinished,
      onTransition: () => T.position.add(v(-1,0,0))
    }),

    new ms.StateTransition({
      parent: placeBlock,
      child: idleState,
      shouldTransition: () => placeBlock.error,
      onTransition: () => {
        T.mode = null
        console.log("lava err")
      }
    }),

    new ms.StateTransition({
      parent: idleState,
      child: tossRack,
      shouldTransition: () => T.mode === "toss",
      onTransition: () => T.position = 
    }),

    new ms.StateTransition({
      parent: tossRack,
      child: idleState,
      shouldTransition: () => depositRack.isFinished,
      onTransition: () => {
        T.mode = null
        console.log("Deposited")
      },
  }), 

  ];

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
    case "break":
      bot.chat("Break!")
      T.mode = "break"
  }
});