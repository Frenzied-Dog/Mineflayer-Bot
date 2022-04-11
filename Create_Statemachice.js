const ms = require("mineflayer-statemachine");
const v = require('vec3');

//定義minecraft中的方向
const LeftOf = (vec) => v(vec.z,0,-vec.x);
const RightOf = (vec) => v(-vec.z,0,vec.x);
const BackOf = (vec) => vec.scaled(-1);

const array = [ v(1,0,0), v(-1,0,0), v(0,1,0), v(0,-1,0), v(0,0,1), v(0,0,-1) ]

module.exports = function StatemachineSetup(bot,T) {
	const mcData = require('minecraft-data')(bot.version);
	
	//定義會使用到的物品
	const torch = mcData.itemsByName["torch"];
	const iron_pickaxe =	mcData.itemsByName["iron_pickaxe"];
	const diamond_pickaxe = mcData.itemsByName["diamond_pickaxe"];
	const cod = mcData.itemsByName["cooked_cod"];
	const salmon = mcData.itemsByName["cooked_salmon"];
	const ancient_debris = mcData.itemsByName["ancient_debris"];
	const gold_nugget = mcData.itemsByName["gold_nugget"];
	const quartz = mcData.itemsByName["quartz"];
	const netherrack = mcData.itemsByName["netherrack"];
	const basalt = mcData.itemsByName["basalt"];
	const gravel = mcData.itemsByName["gravel"];
	const blackstone = mcData.itemsByName["blackstone"];

	//搭配流程圖觀看
	const FindingState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'FindingState';
			this.targets = targets; }

		MyState.prototype.onStateEntered = function() {
			while(this.targets.willSearch[this.targets.searchName].length !== 0){
				const nowSearch = this.targets.willSearch[this.targets.searchName].shift();

				array.some( (item) => {
					const searching = nowSearch.plus(item);
					if ( !this.targets.positions[this.targets.searchName].some((i)=> i.equals(searching)) && this.bot.blockAt(searching).name == this.targets.searchName )
						this.targets.positions[this.targets.searchName].push(searching);
				});
			};
		};

		return MyState;
	}());

	const PlaceBlockState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'PlaceBlockState';
			this.targets = targets;
			this.isFinished = false;
			this.error = false; }

		MyState.prototype.onStateEntered = async function() {
			let way = v(1,0,0);
			array.some( (i) => {
				if ( !["water", "lava", "air"].includes(this.bot.blockAt(this.targets.position.plus(i)).name)) {
					way = i;
					return true;
				}
			});

			let item = bot.inventory.items().filter(item => item.name === "netherrack")[0];
			if (item == undefined) item = bot.inventory.items().filter(item => item.name === "basalt")[0];

			if (this.targets.placingTorch) {
				item = this.bot.inventory.items().filter(item => item.name === "torch")[0];
				if (this.bot.blockAt(this.targets.position.offset(0,-1,0)).name !== "air") way = v(0,-1,0);
				else way = LeftOf(this.targets.mineFaced);
			}

			const toPlaced = this.bot.blockAt(this.targets.position.plus(way));
			const blockFace = way.scaled(-1);

			await this.bot.equip(item, 'hand').catch(err => {
				this.error = true;
				console.log(err);
			});

			await this.bot.placeBlock(toPlaced,blockFace).catch(err => {
				this.error = true;
				console.log(err);
			});

			this.targets.placingTorch = false;
		};

		return MyState;
	}());

	function createCheckLavaState() {
		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const findLava = new FindingState(bot,T);
		const placeBlock = new PlaceBlockState(bot,T);
		const errorState = new ms.BehaviorIdle();

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: findLava,
				shouldTransition: () => true,
				onTransition: () => T.searchName = "lava",
			}),

			new ms.StateTransition({
				parent: findLava,
				child: placeBlock,
				shouldTransition: () => T.positions.lava.length !== 0,
				onTransition: () => {
					placeBlock.isFinished = false; placeBlock.error = false;
					bot.once("blockPlaced", () => placeBlock.isFinished = true);
					T.position = T.positions.lava.shift();
				},
			}),

			new ms.StateTransition({
				parent: placeBlock,
				child: placeBlock,
				shouldTransition: () => placeBlock.isFinished && T.positions.lava.length !== 0,
				onTransition: () => {
					placeBlock.isFinished = false; placeBlock.error = false;
					bot.once("blockPlaced", () => placeBlock.isFinished = true);
					T.position = T.positions.lava.shift();
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
				child: exit,
				shouldTransition: () => placeBlock.isFinished && T.positions.lava.length === 0,
			}),

			new ms.StateTransition({
				parent: findLava,
				child: exit,
				shouldTransition: () => T.positions.lava.length === 0,
			}),
		]

		return new ms.NestedStateMachine(transitions, enter, exit);
	}


	function createMineBlockState() {
		const MineingState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'mineingState';
				this.targets = targets;
				this.error = false;
				this.isFinished = false; }

			MyState.prototype.onStateEntered = function() {
				this.error = false; this.isFinished = false;
				this.bot.dig(this.bot.blockAt(this.targets.position)).catch(err => {
					console.log(err);
					this.error = true;
				});
			};

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const equipIronPickaxe = new ms.BehaviorEquipItem(bot,T);
		const equipDiamondPickaxe = new ms.BehaviorEquipItem(bot,T);
		const digBlock = new MineingState(bot,T);
		const checkLava = createCheckLavaState();
		const errorState = new ms.BehaviorIdle();
		const checkDebris = new FindingState(bot,T);

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: equipIronPickaxe,
				shouldTransition: async () => {
					await bot.waitForChunksToLoad();
					return bot.blockAt(T.position).name !== "ancient_debris";
				},
				onTransition: () => {
					// T.nowMinePos = T.position;
					// T.debris = false;
					T.lava = false;
					const pickaxes = bot.inventory.items().filter( i => i.name === "iron_pickaxe" );
					T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0];
				},
			}),

			new ms.StateTransition({
				parent: enter,
				child: equipDiamondPickaxe,
				shouldTransition: async () => {
					await bot.waitForChunksToLoad();
					return bot.blockAt(T.position).name === "ancient_debris";
				},
				onTransition: () => {
					// T.debris = true;
					T.lava = false;
					const pickaxes = bot.inventory.items().filter( i => i.name === "diamond_pickaxe" );
					T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0];
				},
			}),

			new ms.StateTransition({
				parent: equipIronPickaxe,
				child: digBlock,
				shouldTransition: () => true,
				onTransition: () => bot.once("diggingCompleted", () => digBlock.isFinished = true )
			}),

			new ms.StateTransition({
				parent: equipDiamondPickaxe,
				child: digBlock,
				shouldTransition: () => true,
				onTransition: () => {
					bot.once("diggingCompleted", () => digBlock.isFinished = true );
					T.position = T.positions.ancient_debris.shift();
					// T.nowMinePos = T.position;
				}
			}),

			new ms.StateTransition({
				parent: digBlock,
				child: checkLava,
				shouldTransition: () => digBlock.isFinished,
				onTransition: () => {
					T.willSearch.lava.push(T.position);
					T.willSearch.ancient_debris.push(T.position);
					// console.log(T.willSearch.ancient_debris);
				}
			}),

			new ms.StateTransition({
				parent: checkLava,
				child: checkDebris,
				shouldTransition: () => checkLava.isFinished(),
				onTransition: () => {
					//T.willSearch.push(T.nowMinePos);
					T.searchName = "ancient_debris";
				},
			}),

			new ms.StateTransition({
				parent: checkDebris,
				child: exit,
				shouldTransition: () => T.positions.ancient_debris.length === 0,
			}),

			new ms.StateTransition({
				parent: checkDebris,
				child: equipDiamondPickaxe,
				shouldTransition: () => T.positions.ancient_debris,
				onTransition: () => {
					const pickaxes = bot.inventory.items().filter( i => i.name === "diamond_pickaxe" )
					T.item = pickaxes.sort((a,b) => b.durabilityUsed-a.durabilityUsed)[0]
				}
			}),
		];

		return new ms.NestedStateMachine(transitions, enter, exit);
	}


	function createPickDebrisState() {
		
		const collectState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'collectState';
				this.targets = targets;
				this.error = false;
				this.isFinished = false; }

			MyState.prototype.onStateEntered = async function() {
				this.error; this.isFinished = false;
				if (this.targets.droppedDebris == null) this.isFinished = true
				else {
					try {
						bot.collectBlock.collect(this.targets.droppedDebris);
					} catch (err) {
						console.log(err);
						this.error = true;
					}
				}
			};

			return MyState;
		}());
		
		const getDroppedEntities = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'getDroppedEntities';
				this.targets = targets; }

			MyState.prototype.onStateEntered = function() {
				// const allDebris = Object.values(this.bot.entities).filter(e => e.name==="item" && e.getDroppedItem().name === "ancient_debris");
				// this.targets.droppedDebris = allDebris.sort( (a,b) => a.position.distanceTo(this.bot.entity.position)-b.position.distanceTo(this.bot.entity.position) );
				this.targets.droppedDebris = this.bot.nearestEntity(e => e.name === "item" && e.getDroppedItem().name === "ancient_debris");
			};
			
			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const delay = new ms.BehaviorIdle();
		const getDroppedDebris = new getDroppedEntities(bot,T);
		const collectDebris = new collectState(bot,T);

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: delay,
				shouldTransition: () => true,
				onTransition: () => {
					delay.isFinished = false;
					setTimeout(( () => delay.isFinished = true ), 500);
				},
			}),	

			new ms.StateTransition({
				parent: delay,
				child: getDroppedDebris,
				shouldTransition: () => delay.isFinished,
			}),

			new ms.StateTransition({
				parent: getDroppedDebris,
				child: exit,
				shouldTransition: () => !T.droppedDebris,
			}),

			new ms.StateTransition({
				parent: getDroppedDebris,
				child: collectDebris,
				shouldTransition: () => T.droppedDebris,
				onTransition: () => {
					bot.on("playerCollect", OnCollect);
					function OnCollect(collector, collected) {
						if (collector !== bot.entity) return;
						if (collected.getDroppedItem().name === "ancient_debris"){
							 bot.removeListener("playerCollect", OnCollect);
							 collectDebris.isFinished = true;
						}
					}
				}
			}),

			new ms.StateTransition({
				parent: collectDebris,
				child: delay,
				shouldTransition: () => collectDebris.isFinished,
				onTransition: () => {
					delay.isFinished = false;
					setTimeout(( () => delay.isFinished = true ), 300);
				},
			}),

		]


		return new ms.NestedStateMachine(transitions, enter, exit);
	}


	function createSpineState() {
		const cPlusState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'cPlusState';
				this.targets = targets; }

			MyState.prototype.onStateEntered = function() {
				this.targets.c++;
			};

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const cPlus = new cPlusState(bot,T);
		const moveToMinePos = new ms.BehaviorMoveTo(bot,T);
		const placeTorch = new PlaceBlockState(bot,T)
		const breakUpper = createMineBlockState();
		const breakLower = createMineBlockState();
		const moveToNowBone = new ms.BehaviorMoveTo(bot,T);
		const placeUpper = new PlaceBlockState(bot,T);
		const placeLower = new PlaceBlockState(bot,T);
		const pickUpDroppedDebris = createPickDebrisState();

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: cPlus,
				shouldTransition: () => true,
				onTransition: () => { if(!T.mineFaced.equals(RightOf(T.axis))) T.mineFaced = LeftOf(T.axis);},
			}),

			new ms.StateTransition({
				parent: cPlus,
				child: pickUpDroppedDebris,
				shouldTransition: () => T.c>20, // for test
			}),

			new ms.StateTransition({
				parent: pickUpDroppedDebris,
				child: cPlus,
				shouldTransition: () => pickUpDroppedDebris.isFinished() && T.mineFaced.equals(LeftOf(T.axis)),
				onTransition: () => {
					T.c = 0;
					T.mineFaced = RightOf(T.axis);
				},
			}),

			new ms.StateTransition({
				parent: pickUpDroppedDebris,
				child: exit,
				shouldTransition: () => pickUpDroppedDebris.isFinished() && T.mineFaced.equals(RightOf(T.axis)),
			}),

			new ms.StateTransition({
				parent: cPlus,
				child: moveToMinePos,
				shouldTransition: () => true,
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(T.c-1))
			}),

			new ms.StateTransition({
				parent: moveToMinePos,
				child: placeTorch,
				shouldTransition: () => moveToMinePos.isFinished() && T.c%10 === 5 && bot.blockAt(T.position).name !== 'torch', // for test
				onTransition: () => {
					placeTorch.isFinished = false; placeTorch.error = false;
					bot.once("blockPlaced", () => placeTorch.isFinished = true );
					T.placingTorch = true;
				},
			}),

			new ms.StateTransition({
				parent: placeTorch,
				child: breakUpper,
				shouldTransition: () => placeTorch.isFinished || placeTorch.error,
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(T.c)).offset(0,1,0),
			}),

			new ms.StateTransition({
				parent: moveToMinePos,
				child: breakUpper,
				shouldTransition: () => moveToMinePos.isFinished(),
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(T.c)).offset(0,1,0),
			}),

			new ms.StateTransition({
				parent: breakUpper,
				child: moveToNowBone,
				shouldTransition: () => T.lava,
				onTransition: () => T.position = T.nowBone,
			}),

			new ms.StateTransition({
				parent: breakUpper,
				child: breakLower,
				shouldTransition: () => breakUpper.isFinished(),
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(T.c)),
			}),

			new ms.StateTransition({
				parent: breakLower,
				child: moveToNowBone,
				shouldTransition: () => T.lava,
				onTransition: () => T.position = T.nowBone,
			}),

			new ms.StateTransition({
				parent: breakLower,
				child: cPlus,
				shouldTransition: () => breakLower.isFinished(),
			}),

			new ms.StateTransition({
				parent: moveToNowBone,
				child: placeLower,
				shouldTransition: () => moveToNowBone.isFinished(),
				onTransition: () => {
					placeLower.isFinished = false; placeLower.error = false;
					bot.once("blockPlaced", () => placeLower.isFinished = true);
					T.position = T.nowBone.plus(T.mineFaced);
				},
			}),

			new ms.StateTransition({
				parent: placeLower,
				child: placeUpper,
				shouldTransition: () => placeLower.isFinished,
				onTransition: () => {
					placeUpper.isFinished = false; placeUpper.error = false;
					bot.once("blockPlaced", () => placeUpper.isFinished = true);
					T.position = T.nowBone.plus(T.mineFaced).offset(0,1,0);
				},
			}),

			new ms.StateTransition({
				parent: placeUpper,
				child: cPlus,
				shouldTransition: () => placeUpper.isFinished && T.mineFaced.equals(LeftOf(T.axis)),
				onTransition: () => {
					T.c = 0;
					T.mineFaced = RightOf(T.axis);
				},
			}),

			new ms.StateTransition({
				parent: placeUpper,
				child: exit,
				shouldTransition: () => placeUpper.isFinished && T.mineFaced.equals(RightOf(T.axis)),
			}),

		];

		return new ms.NestedStateMachine(transitions, enter, exit);   
	}


	function createBreakStraightState() {
		const mPlusState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'mPlusState';
				this.targets = targets; }

			MyState.prototype.onStateEntered = function() {
				this.targets.m++;
			};

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const mPlus = new mPlusState(bot,T);
		const moveToMinePos = new ms.BehaviorMoveTo(bot,T);
		const breakUpper = createMineBlockState();
		const breakLower = createMineBlockState();
		const errorState = new ms.BehaviorIdle();		
		const pickUpDroppedDebris = createPickDebrisState();

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: mPlus,
				shouldTransition: () => true,
				onTransition: () => T.mineFaced = T.axis
			}),

			new ms.StateTransition({
				parent: mPlus,
				child: pickUpDroppedDebris,
				shouldTransition: () => T.m>3,
			}),

			new ms.StateTransition({
				parent: pickUpDroppedDebris,
				child: exit,
				shouldTransition: () => pickUpDroppedDebris.isFinished(),
			}),

			new ms.StateTransition({
				parent: mPlus,
				child: moveToMinePos,
				shouldTransition: () => true,
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(-4+T.m))
			}),

			new ms.StateTransition({
				parent: moveToMinePos,
				child: breakUpper,
				shouldTransition: () => moveToMinePos.isFinished(),
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(-3+T.m)).offset(0,1,0)
			}),

			new ms.StateTransition({
				parent: breakUpper,
				child: errorState,
				shouldTransition: () => T.lava,
			}),

			new ms.StateTransition({
				parent: breakUpper,
				child: breakLower,
				shouldTransition: () => breakUpper.isFinished(),
				onTransition: () => T.position = T.nowBone.plus(T.mineFaced.scaled(-3+T.m))
			}),

			new ms.StateTransition({
				parent: breakLower,
				child: errorState,
				shouldTransition: () => T.lava,
			}),

			new ms.StateTransition({
				parent: breakLower,
				child: mPlus,
				shouldTransition: () => breakLower.isFinished(),
			}),
		];

		return new ms.NestedStateMachine(transitions, enter, exit);   
	}


	function createMineProcessState() {
		const bonesPlusState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'bonesPlusState';
				this.targets = targets; }

			MyState.prototype.onStateEntered = function() {
				this.targets.bones++;
				this.targets.nowBone = this.targets.mineCenter.plus(this.targets.axis.scaled(this.targets.bones*3));
			};

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const goToMineCenter = new ms.BehaviorMoveTo(bot,T);
		const bonesPlus = new bonesPlusState(bot,T);
		const backToMineCenter = new ms.BehaviorMoveTo(bot,T);
		const breakStraight = createBreakStraightState();
		const spineProcess = createSpineState();
		const walkBackward = new ms.BehaviorMoveTo(bot,T);
		const placeUpper = new PlaceBlockState(bot,T);
		const placeLower = new PlaceBlockState(bot,T);
		const errorState = new ms.BehaviorIdle();

		const transitions = [
			new ms.StateTransition({
				parent: enter,
				child: goToMineCenter,
				shouldTransition: () => T.bones === 0,
				onTransition: () => T.position = T.mineCenter,
			}),

			new ms.StateTransition({
				parent: goToMineCenter,
				child: bonesPlus,
				shouldTransition: () => goToMineCenter.isFinished(),
			}),

			new ms.StateTransition({
				parent: enter,
				child: breakStraight,
				shouldTransition: () => T.c === 0 && T.m !==0,
			}),

			new ms.StateTransition({
				parent: enter,
				child: spineProcess,
				shouldTransition: () => true,
				onTransition: () => T.c--,
			}),

			new ms.StateTransition({
				parent: spineProcess,
				child: bonesPlus,
				shouldTransition: () => spineProcess.isFinished(),
				onTransition: () => T.c = 0,
			}),

			new ms.StateTransition({
				parent: bonesPlus,
				child: backToMineCenter,
				shouldTransition: () => T.bones > 100, // for test
				onTransition: () => T.position = T.mineCenter,
			}),

			new ms.StateTransition({
				parent: backToMineCenter,
				child: exit,
				shouldTransition: () => backToMineCenter.isFinished(),
			}),

			new ms.StateTransition({
				parent: bonesPlus,
				child: breakStraight,
				shouldTransition: () => true,
				onTransition: () => T.m = 0,
			}),

			new ms.StateTransition({
				parent: breakStraight,
				child: spineProcess,
				shouldTransition: () => breakStraight.isFinished(),
			}),

			new ms.StateTransition({
				parent: breakStraight,
				child: walkBackward,
				shouldTransition: () => T.lava,
				onTransition: () => {
					if ( bot.entity.position.distanceTo(T.mineCenter)<9 ) T.position = T.mineCenter;
					else T.position = bot.entity.position.minus(T.mineFaced.scaled(9));
				},
			}),

			new ms.StateTransition({
				parent: walkBackward,
				child: placeLower,
				shouldTransition: () => walkBackward.isFinished(),
				onTransition: () => {
					placeLower.isFinished = false; placeLower.error = false;
					bot.once("blockPlaced", () => placeLower.isFinished = true);
					T.position.add(T.mineFaced);
				},
			}),

			new ms.StateTransition({
				parent: placeLower,
				child: placeUpper,
				shouldTransition: () => placeLower.isFinished,
				onTransition: () => {
					placeUpper.isFinished = false; placeUpper.error = false;
					bot.once("blockPlaced", () => placeUpper.isFinished = true);
					T.position.translate(0,1,0);
				},
			}),

			new ms.StateTransition({
				parent: placeUpper,
				child: errorState,
				shouldTransition: () => placeUpper.isFinished,
				onTransition: () => T.error = "Main Lava",
			}),
		];

		return new ms.NestedStateMachine(transitions, enter, exit);   
	}


	function createCleanPackState() {
		const DepositState = ( function(){
			function MyState(bot, targets)
			{ this.bot = bot;
				this.active = false;
				this.stateName = 'DepositState';
				this.targets = targets;
				this.isFinished = false; }

			MyState.prototype.onStateEntered = async function() {
				this.targets.error = "";	this.isFinished = false;
				const chest = await this.bot.openContainer(this.bot.blockAt(this.targets.position));

				if (chest.firstEmptyContainerSlot() == null) {
					chest.close();
					this.targets.error = "Chest full";
				} else {
					for (const i of [ancient_debris, gold_nugget, quartz]) {
						await chest.deposit(i.id,null,this.bot.inventory.count(i.id)).catch(err => {
							if (err.message === "destination full") {
								chest.close();
								this.targets.error = "Chest full";
							}
						});
						if (this.targets.error) break;
					}
					if (!this.targets.error) {
						chest.close();
						this.isFinished = true;
					}
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
				this.isFinished = false; }

			MyState.prototype.onStateEntered = async function() {
				this.isFinished = false;
				await this.bot.lookAt(this.targets.position.offset(0.5,0.5,0.5),true);
				
				for (const i of [netherrack, basalt])
					await this.bot.toss(i.id,null, Math.floor(this.bot.inventory.count(i.id)/64)*64);

				for (const i of [gravel, blackstone])
					await this.bot.toss(i.id,null, this.bot.inventory.count(i.id));

				await this.bot.activateBlock(this.bot.blockAt(this.targets.position)).then( () => this.isFinished = true);
			}

			return MyState;
		}());

		const enter = new ms.BehaviorIdle();
		const exit = new ms.BehaviorIdle();
		const goToMineCenter = new ms.BehaviorMoveTo(bot,T);
		const tossBlocks = new TossState(bot,T);
		const depositMineral = new DepositState(bot,T);

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
				child: depositMineral,
				shouldTransition: () => true,
				onTransition: async () => {
					T.position = T.mineCenter.plus(LeftOf(T.axis));
				},
			}),

			new ms.StateTransition({
				parent: depositMineral,
				child: exit,
				shouldTransition: () => depositMineral.isFinished,
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
			this.isFinished = false; }

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
					amount = 2;
					break;
				case "foods":
					this.targets.position = this.targets.mineCenter.plus(RightOf(this.targets.axis)).minus(this.targets.axis);
					amount = 128;
					break;
				case "torch":
					this.targets.position = this.targets.mineCenter.plus(LeftOf(this.targets.axis)).plus(this.targets.axis);
					amount = 128; // for test
					break;
			}

			const chest = await this.bot.openContainer(this.bot.blockAt(this.targets.position)); //v(10,173,-9)

			if (this.targets.withdrawItemName === "foods") {
				this.targets.withdrawItemName = (chest.containerCount(cod.id) === 0) ? "cooked_salmon" : "cooked_cod";
			}

			const item = mcData.itemsByName[this.targets.withdrawItemName];

			if (chest.containerCount(item.id) === 0) {
				chest.close();
				this.targets.error = "Out of " + item.displayName;
			} else {
				await chest.withdraw(item.id,null,amount).then( () => {
					chest.close();
					this.isFinished = true;
				}).catch(err => {
					console.log(err.message);
					if (err.message.includes("Can't find "+item.name+" in slots")) {
						chest.close();
						if (this.bot.inventory.count(item.id) <= 1) 
							this.targets.error = "Out of " + item.displayName;
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
			this.targets = targets; }

		MyState.prototype.onStateEntered = function() {
			console.log(T.error+" !!")
			this.mode = null;
		};

		return MyState;
	}());

	const EatingState = ( function(){
		function MyState(bot, targets)
		{ this.bot = bot;
			this.active = false;
			this.stateName = 'EatingState';
			this.targets = targets;
			this.isFinished = false; }

		MyState.prototype.onStateEntered = async function() {
			this.isFinished = false;
			let item = this.bot.inventory.items().filter(i => i.name === "cooked_cod")[0];
			if (item == undefined) item = this.bot.inventory.items().filter(i => i.name === "cooked_salmon")[0];
			await this.bot.equip(item, 'hand');
			await this.bot.consume().then( ()=> this.isFinished = true );
		};

		return MyState;
	}());

	const idleState = new ms.BehaviorIdle();
	const mineProcess = createMineProcessState();
	const eatFoods = new EatingState(bot,T);
	const cleanPack = createCleanPackState();
	const delay = new ms.BehaviorIdle();
	const gainMaterials = new WithdrawState(bot,T);
	const warning = new WarnState(bot,T);

	const transitions = [
		new ms.StateTransition({
			parent: idleState,
			child: mineProcess,
			shouldTransition: () => T.mode === "mine" && T.mineCenter.norm(),
			onTransition: () => T.error = null,
		}),

		new ms.StateTransition({
			parent: mineProcess,
			child: cleanPack,
			shouldTransition: () => mineProcess.isFinished() || T.mode === null,
			onTransition: () => {
				T.withdrawItemName = null
				T.mode = null;
				bot.chat("finish! Cleaning Pack")
				console.log("Finish !! Cleaning Pack")
			},
		}),

		new ms.StateTransition({
			parent: mineProcess,
			child: cleanPack,
			shouldTransition: () => {
				T.withdrawItemName = null;

				if (!bot.inventory.firstEmptyInventorySlot())
					return true;
				const materials = [ torch, iron_pickaxe, diamond_pickaxe ];
				const foods = [	cod, salmon ];

				for (const i of materials) {
					if (bot.inventory.count(i.id) === 0) {
						T.withdrawItemName = i.name;
						break;
					}}

				if ( foods.every(i => bot.inventory.count(i.id) === 0) )
					T.withdrawItemName = "foods" ;

				return T.withdrawItemName;
			},
		}),

		new ms.StateTransition({
			parent: mineProcess,
			child: eatFoods,
			shouldTransition: () => bot.food < 14,
		}),

		new ms.StateTransition({
			parent: eatFoods,
			child: mineProcess,
			shouldTransition: () => eatFoods.isFinished,
			//onTransition: () => bot.chat("has eaten."),
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: idleState,
			shouldTransition: () => cleanPack.isFinished() && !T.withdrawItemName,
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: delay,
			shouldTransition: () => cleanPack.isFinished() && T.withdrawItemName,
			onTransition: () => {
				delay.isFinished = false;
				setTimeout(( () => delay.isFinished = true ), 800);
			},
		}),

		new ms.StateTransition({
			parent: delay,
			child: gainMaterials,
			shouldTransition: () => delay.isFinished,
		}),

		new ms.StateTransition({
			parent: gainMaterials,
			child: idleState,
			shouldTransition: () => gainMaterials.isFinished,
			//onTransition: () => bot.chat("Gained "+T.withdrawItemName),
		}),

		new ms.StateTransition({
			parent: cleanPack,
			child: warning,
			shouldTransition: () => (cleanPack.isFinished() && T.error === "Main Lava") || T.error === "Chest full",
		}),

		new ms.StateTransition({
			parent: gainMaterials,
			child: warning,
			shouldTransition: () => T.error && T.error.includes("Out of"),
		}),

		new ms.StateTransition({
			parent: warning,
			child: idleState,
			shouldTransition: () => true,
			onTransition: () => T.mode = null,
		}),
	]

	const rootLayer = new ms.NestedStateMachine(transitions, idleState);
	const stateMachine = new ms.BotStateMachine(bot, rootLayer);
	const webserver = new ms.StateMachineWebserver(bot, stateMachine,13579);
	webserver.startServer();
}