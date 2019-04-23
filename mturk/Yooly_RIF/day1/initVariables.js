let CDSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,25)),4)); // randomized 200 CD trials
let SceneSet = chance1.shuffle(InsertLetter(counter(1,68),'b').concat(InsertLetter(counter(1,68),'m'))); // randomize beach and mountain

let RpPlusExem = InsertLetter(chance1.shuffle(counter(1,15)),'plus');
let RpMinusExem = InsertLetter(chance1.shuffle(counter(1,75)),'o');
let LuresExem = InsertLetter(chance1.shuffle(counter(1,30)),'lure');

let RpPlusTriplets = [];
let NrpTriplets = InsertLetter(chance1.shuffle(counter(1,90)),'nrp');
RpPlusTriplets = Sandwich(RpPlusExem,RpMinusExem.slice(0,30));
RpMinusTriplets = RpMinusExem.slice(30,75);

let AllImages = [];
AllImages = AllImages.concat(RpPlusTriplets,RpMinusTriplets,NrpTriplets);

[Triplets,Triplets2] = repmat(ThreeSlice(RpPlusTriplets,RpMinusTriplets,NrpTriplets),5);

function repmat(array, count) {
  let result = [];
  while (count--) {
    result = result.concat(array);
  }
  return result;
}

function counter(start, end, interval) {
  if (interval == undefined) {
    interval = 1;
  }
  let result = [];
  if (start > end) {
    start = start - 360;
  }
  while (start <= end) {
    result = result.concat(start);
    start = start + interval;
  }
  return result;
}

function perm_concat(array1, array2) {
  let result = [];
  for (let i = 0; i < array1.length; i++) {
    for (let j = 0; j < array2.length; j++) {
      result = result.concat(array1[i].toString() + '_' + array2[j].toString());
    }
  }
  return result;
}

function Sandwich(jam,crust) {
  let result = [];
  for (let i = 0; i < jam.length; i++) {
    result = result.concat(crust[i*2]);
    result = result.concat(jam[i]);
    result = result.concat(crust[i*2+1]);
  }
  return result;
}

function InsertLetter(array,text){
  let result = [];
  for (let i = 0; i < array.length; i++) {
    result = result.concat(text + array[i].toString());
  }
  return result
}

function ThreeSlice(tripA,tripB,tripC){
  let result = [];
  let A = []; let B = []; let C = []; let D = [];
  for (let i = 0; i < tripA.length/3; i++) {
    A[i] = tripA.slice(i,i+3);
  }
  for (let i = 0; i < tripB.length/3; i++) {
    B[i] = tripB.slice(i,i+3);
  }
  for (let i = 0; i < tripC.length/3; i++) {
    C[i] = tripC.slice(i,i+3);
  }
  D = D.concat(A,B,C);
  E = E.concat(A,A,C);
  D = chance1.shuffle(D);
  E = chance1.shuffle(E);
  for (let i = 0; i < D.length; i++) {
    result = result.concat(D[i]);
  }
  for (let i = 0; i < E.length; i++) {
    result2 = result2.concat(E[i]);
  }
  return [result,result2]
}
