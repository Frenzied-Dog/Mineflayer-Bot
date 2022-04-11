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
      //console.log(`${bot.username} has entered the ${this.StateName} state.`);
      array.some( (item) => {
        if ( this.bot.blockAt(this.targets.position.plus(item)).name == "lava" ){
          this.targets.position.add(item);
          return true;
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
      const chest = await this.bot.openChest(this.bot.blockAt(v(11,173,-9)));

      if (chest.firstEmptyContainerSlot() == null) {
        this.bot.chat("Chest Full");
        chest.close();
        this.isFinished = true;
      } else {
        const items = this.bot.inventory.items();
        const rack = items.filter(item => item.name === "netherrack")[0];
        if (rack != null) {
          await chest.deposit(rack.type,null,Math.floor(this.bot.inventory.count(rack.type)/64)*64).then(
            () => chest.close()
          ).catch(err => {
            if (err.message === "destination full") {
              console.log("Chest Full !!!")
              chest.close()
            }
          });
        } else {
          chest.close()
        }
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
      const chest = await this.bot.openChest(this.bot.blockAt(v(10,173,-9)));
      const item=mcData.itemsByName[this.targets.item]
      if (chest.containerCount(item.id) == 0) {
        this.bot.chat("out of "+item.name);
        chest.close();
        this.isFinished = true;
      }
      else {
        const items = this.bot.inventory.items();
        await chest.withdraw(item.id,null,3).then(
          () => chest.close()
        ).catch(err => {
          console.log(err.message)
          if (err.message.includes("Can't find "+item.name+" in slots [0 - 27]")) {
            console.log("Chest empty !!!")
            chest.close()
          }
        });

        this.isFinished = true;
      }
    };

    return MyState;
  }());


  const idleState = new ms.BehaviorIdle();
  const checkLava = new FindLavaState(bot,T);
  const placeBlock = new ms.BehaviorPlaceBlock(bot,T);
  const depositRack = new DepositState(bot,T);
  const withdrawTorch = new WithdrawState(bot,{item: "iron_pickaxe"})
  const breakBlock = new ms.BehaviorMineBlock(bot,T)

  transitions = [
    new ms.StateTransition({
      parent: idleState,
      child: checkLava,
      shouldTransition: () => T.mode == "check",
      onTransition: () => { T.handled = false ; T.position=v(13,174,-8) },
    }),

    new ms.StateTransition({
      parent: checkLava,
      child: idleState,
      shouldTransition: () => T.position == null || bot.blockAt(T.position).name!="lava",
      onTransition: () => {
        T.mode = null;
        console.log("no lava");
        console.log(T.position)
      }
    }),

    new ms.StateTransition({
      parent: checkLava,
      child: idleState,
      shouldTransition: () => bot.blockAt(T.position).name=="lava" && T.handled,
      onTransition: () => {
        T.mode = null;
        console.log("Lava err");
      }
    }),  

    new ms.StateTransition({
      parent: checkLava,
      child: placeBlock,
      shouldTransition: () => bot.blockAt(T.position, extraInfos=false).name=="lava",
      onTransition: () => {
        bot.once("blockPlaced", ()=> placeBlock.isFinished = true);

        const items = bot.inventory.items();
        
        T.position.add(v(1,0,0));
        T.item = items.filter(item => item.name === "netherrack")[0];
        T.blockFace = v(-1,0,0);
      }
    }),  

    new ms.StateTransition({
      parent: placeBlock,
      child: checkLava,
      shouldTransition: () => placeBlock.error || placeBlock.isFinished,
      onTransition: () => {
        T.handled = true;
      },
    }),  

    new ms.StateTransition({
      parent: idleState,
      child: depositRack,
      shouldTransition: () => T.mode === "deposit",
    }),

    new ms.StateTransition({
      parent: depositRack,
      child: idleState,
      shouldTransition: () => depositRack.isFinished,
      onTransition: () => {
        T.mode = null
        console.log("Deposited")
      },
  }),  

    new ms.StateTransition({
      parent: idleState,
      child: withdrawTorch,
      shouldTransition: () => T.mode ==="withdraw",
    }),

    new ms.StateTransition({
      parent: withdrawTorch,
      child: idleState,
      shouldTransition: () => withdrawTorch.isFinished,
      onTransition: () => {
        T.mode = null;
        console.log("Withdrawed");
      }
    }),

    new ms.StateTransition({
      parent: idleState,
      child: breakBlock,
      shouldTransition: () => T.mode ==="break",
      onTransition: () => {
        bot.once("diggingCompleted", () => breakBlock.isFinished = true);

        T.position = v(10,174,-7)
      }
    }),

    new ms.StateTransition({
      parent: breakBlock,
      child: idleState,
      shouldTransition: () => breakBlock.error || breakBlock.isFinished,
      onTransition: () => {
        T.mode = null;
        console.log("Breaked");
      }
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
