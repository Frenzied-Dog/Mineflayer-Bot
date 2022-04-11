const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals: { GoalNear } } = require('mineflayer-pathfinder');
const v = require('vec3');
const ms = require("mineflayer-statemachine");
const inventoryViewer = require('mineflayer-web-inventory')

//定義minecraft中的方向
const LeftOf = (vec) => v(vec.z,0,-vec.x);
const RightOf = (vec) => v(-vec.z,0,vec.x);
const BackOf = (vec) => vec.scaled(-1);

//登入資料
config={host: 'localhost',
				port: 25565,
				username: 'JustABot',
				version: '1.18.1'}

//變數宣告
const T = { mode: null, error: null,
						mineCenter: v(0,0,0), axis: v(0,0,0), m: 0,
						bones: 0, nowBone: v(0,0,0), c: 0, mineFaced: v(0,0,0),
						lava: false, searchName:"", positions:{ lava:[], ancient_debris:[] },
						willSearch:{ lava:[], ancient_debris:[] }, droppedDebris: null, withdrawItemName:null, depositItemName:""  };

const array = [ v(1,0,0), v(-1,0,0), v(0,1,0), v(0,-1,0), v(0,0,1),v(0,0,-1) ]
bot = mineflayer.createBot(config);

bot.once('spawn', ()=>{
	const mcData = require('minecraft-data')(bot.version)
	inventoryViewer(bot);
	bot.loadPlugin(pathfinder);
	bot.loadPlugin(require('mineflayer-collectblock').plugin);

	function createCleanPackState() {
		const DepositState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'DepositState';
				this.targets = targets;
				this.isFinished = false;
				this.error = "" }

			MyState.prototype.onStateEntered = async function() {
				this.error = "";	this.isFinished = false;
				const chest = await this.bot.openContainer(this.bot.blockAt(this.targets.position));

				if (chest.firstEmptyContainerSlot() == null) {
					chest.close();
					this.error = "Chest full";
				} else {
					const item = mcData.itemsByName[this.targets.depositItemName];
					await chest.deposit(item.id,null,this.bot.inventory.count(item.id)).then( () => {
						chest.close();
						this.isFinished = true;
					}).catch(err => {
						if (err.message === "destination full") {
							chest.close();
							this.error = "Chest full";
						}
					});
				}
			};

			return MyState;
		}());

		const TossState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'TossState';
				this.targets = targets;
				this.isFinished = false;}

			MyState.prototype.onStateEntered = async function() {
				this.isFinished = false;
				await this.bot.lookAt(this.targets.position.offset(0.5,0.5,0.5),true);
				const items = [mcData.itemsByName["netherrack"], mcData.itemsByName["basalt"]];
				
				for (const i of items)
					await this.bot.toss(i.id,null, Math.floor(this.bot.inventory.count(i.id)/64)*64);
				
				await this.bot.activateBlock(this.bot.blockAt(this.targets.position)).then( () => this.isFinished = true);
			}

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const goToMineCenter = new ms.BehaviorMoveTo(bot,T);
		const tossBlocks = new TossState(bot,T);
		const delay1 = new ms.BehaviorIdle();
		const delay2 = new ms.BehaviorIdle();
		const depositDebris = new DepositState(bot,T);

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: goToMineCenter,
				shouldTransition: () => true,
				onTransition: () => T.position = T.mineCenter,
			}),

			new ms.StateTransition({
				parent: goToMineCenter,
				child: tossBlocks,
				shouldTransition: () => goToMineCenter.isFinished(),
				onTransition: () => T.position = T.mineCenter.plus(T.axis).plus(RightOf(T.axis)).offset(0,1,0),
			}),

			new ms.StateTransition({
				parent: tossBlocks,
				child: delay1,
				shouldTransition: () => true,
				onTransition: () => {
					console.log("toss finish")
					delay1.isFinished = false;
					setTimeout(( () => delay1.isFinished = true ), 1500);
				},
			}),

			new ms.StateTransition({
				parent: delay1,
				child: depositDebris,
				shouldTransition: () => delay1.isFinished && bot.inventory.count(mcData.itemsByName["ancient_debris"].id) !== 0,
				onTransition: () => {
					T.position = T.mineCenter.plus(LeftOf(T.axis));
					T.depositItemName = "ancient_debris";
				},
			}),

			new ms.StateTransition({
				parent: delay1,
				child: exit,
				shouldTransition: () => delay1.isFinished,
			}),

			new ms.StateTransition({
				parent: depositDebris,
				child: delay2,
				shouldTransition: () => depositDebris.isFinished,
				onTransition: () => {
					console.log("deposit finish")
					delay2.isFinished = false;
					setTimeout(( () => delay2.isFinished = true ), 1500);
				},
			}),

			new ms.StateTransition({
				parent: delay2,
				child: exit,
				shouldTransition: () => delay2.isFinished,
			}),
		];

		return new ms.NestedStateMachine(transitions, enter, exit);   
	}

	const WithdrawState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'WithdrawState';
			this.targets = targets;
			this.isFinished = false;
			this.error = "" }

		MyState.prototype.onStateEntered = async function() {
			this.isFinished = false; this.error = "";

			let amount = 0;
			switch(this.targets.withdrawItemName) {
				case "iron_pickaxe":
					this.targets.position = this.targets.mineCenter.plus(LeftOf(this.targets.axis)).minus(this.targets.axis);
					amount = 7;
					break;
				case "diamond_pickaxe":
					this.targets.position = this.targets.mineCenter.plus(LeftOf(this.targets.axis)).minus(this.targets.axis);
					amount = 1;
					break;
				case "foods":
				// case "cooked_cod":
				// case "cooked_salmon":
					this.targets.position = this.targets.mineCenter.plus(RightOf(this.targets.axis)).minus(this.targets.axis);
					amount = 128;
					break;
				case "torch":
					this.targets.position = this.targets.mineCenter.plus(LeftOf(this.targets.axis)).plus(this.targets.axis);
					amount = 128;
					break;
			}

			const chest = await this.bot.openContainer(this.bot.blockAt(this.targets.position)); //v(10,173,-9)
			console.log("chest open")
			if (this.targets.withdrawItemName === "foods") {
				const cod = mcData.itemsByName["cooked_cod"];
				const	salmon = mcData.itemsByName["cooked_salmon"];
				this.targets.withdrawItemName = (chest.containerCount(cod.id) === 0) ? "cooked_salmon" : "cooked_cod";
				console.log(this.targets.withdrawItemName)
			}

			const item = mcData.itemsByName[this.targets.withdrawItemName];
			
			if (chest.containerCount(item.id) === 0) {
				chest.close();
				this.error = "Out of" + item.displayName;
			} else {
				await chest.withdraw(item.id,null,amount).then( () => {
					console.log("withdraw finish")
					chest.close();
					this.isFinished = true;
				}).catch(err => {
					console.log(err.message);
					if (err.message.includes("Can't find "+item.name+" in slots [0 - 27]")) {
						chest.close();
						if (this.bot.inventory.count(item.id) === 0)
							this.error = "Out of" + item.displayName;
						else
							this.isFinished = true;
					}
				});
			}
		};

		return MyState;
	}());

	const WarnState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'WarnState';
			this.targets = targets;}

		MyState.prototype.onStateEntered = function() {
			console.log(T.error+" !!")
			this.mode = null;
		};

		return MyState;
	}());

	const idleState = new ms.BehaviorIdle();
	const mineProcess = new ms.BehaviorIdle();
	const cleanPack = createCleanPackState();
	const gainMaterials = new WithdrawState(bot,T);
	const warning = new WarnState(bot,T);

	const transitions = [
		new ms.StateTransition({
			parent: idleState,
			child: mineProcess,
			shouldTransition: () => T.mode === "go",// && T.mineCenter.norm(),
			onTransition: () => {
				T.mineCenter = v(20,173,10); T.axis = v(0,0,-1);
			},
		}),

		new ms.StateTransition({
			parent: mineProcess,
			child: cleanPack,
			shouldTransition: () => {
				T.withdrawItemName = null;
				const inv = bot.inventory;
				if (!inv.firstEmptyInventorySlot()) 
					return true;
				const materials = [ mcData.itemsByName["torch"],
														mcData.itemsByName["iron_pickaxe"],
														mcData.itemsByName["diamond_pickaxe"] ];
				const foods = [	mcData.itemsByName["cooked_cod"],
												mcData.itemsByName["cooked_salmon"] ];

				for (const i of materials) {
					if (inv.count(i.id) === 0) {
						T.withdrawItemName = i.name;
						break;
					}}

				if ( foods.every(i => inv.count(i.id) === 0) )
					T.withdrawItemName = "foods" ;

				return T.withdrawItemName;
			},
			onTransition: () => console.log(T.withdrawItemName),
		}),

		new ms.StateTransition({
			parent: mineProcess,
			child: idleState,
			shouldTransition: () => true,
			onTransition: () => {
				console.log("Test finish");
				T.mode = null;
			},
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: idleState,
			shouldTransition: () => cleanPack.isFinished() && !T.withdrawItemName,
			onTransition: () => T.mode = null,
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: gainMaterials,
			shouldTransition: () => cleanPack.isFinished() && T.withdrawItemName,
		}),

		new ms.StateTransition({
			parent: gainMaterials,
			child: mineProcess,
			shouldTransition: () => gainMaterials.isFinished,
			onTransition: () => console.log("Gained "+T.withdrawItemName),
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: warning,
			shouldTransition: () => (cleanPack.isFinished() && T.error === "Main Lava") || T.error === "Chest full",
		}),

		new ms.StateTransition({
			parent: gainMaterials,
			child: warning,
			shouldTransition: () => T.error && T.error.includes("Out Of"),
		}),

		new ms.StateTransition({
			parent: warning,
			child: idleState,
			shouldTransition: () => true,
		}),
	]

	const rootLayer = new ms.NestedStateMachine(transitions, idleState);
	
	// We can start our state machine simply by creating a new instance.
	const stateMachine = new ms.BotStateMachine(bot, rootLayer);
	const webserver = new ms.StateMachineWebserver(bot, stateMachine,13579);
	webserver.startServer();	
});

bot.on('chat', async (username, message) => {
	if (username === bot.username) return;

	if (message === 'go')
		T.mode = message
});