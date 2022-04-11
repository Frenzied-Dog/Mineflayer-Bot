const v = require('vec3');
/*
const targets={}

targets.test="hi"
targets.fun = ()=>{
	a=100;
	b=50;
	console.log(a+b,targets.test)
}

targets.fun()
console.log(targets)
*/

/*
function Left(vec){
	return v(vec.z,0,-vec.x)
}

function Right(vec){
	return v(-vec.z,0,vec.x)
}

function Back(vec){
	return vec.scaled(-1)
}

const v = require('vec3');

A=v(-1,0,0);
B=A.offset(0,2,0)
C=A.plus(v(0,2,0))

console.log(B,'\n',C)
*/

/*
console.log(undefined === null)
console.log(undefined == null)
*/
/*
const t=[1,2,3,4,5,6,7,8,9]

const s = t.filter((n)=>n<=5)

s.sort( (a,b)=> a-b )
console.log(s)
*/
/*
a = {lava: [1,3,5,7,9]}
a.anc_debris = [2,5]
b='lava'
console.log(a["anc_debris"])
*/
/*
let a=v(1,1,1)
const L=[a,v(2,5,8)]
console.log(a==v(1,1,1))
*/
/*
let a=1 , b=2
const l = [a,b];
console.log(l);
a++; console.log(l);
*/
/*
const testing = require('./export_test.js');
const a = 1;
testing(a)
*/
function test(a,b) {
	console.log(a,b);
}

test(1)