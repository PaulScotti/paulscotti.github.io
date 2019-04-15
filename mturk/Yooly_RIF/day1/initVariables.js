let CDSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,25)),4)); // randomized 200 CD trials
let SceneSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,68)),4)); // randomize beach (0) and mountain (1)

let RpPlusExem = InsertLetter(chance1.shuffle(counter(1,15)),'plus');
let RpMinusExem = InsertLetter(chance1.shuffle(counter(1,60)),'o');
let LuresExem = InsertLetter(chance1.shuffle(counter(1,30)),'lure');

let RpTriplets = [];
let NrpTriplets = InsertLetter(chance1.shuffle(counter(1,90)),'nrp');
RpTriplets = Sandwich(RpPlusExem,RpMinusExem);

let AllImages = [];
AllImages = AllImages.concat(RpTriplets,NrpTriplets);

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
