let CDSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,25)),4)); // randomized 200 CD trials
let SceneSet = repmat(chance1.shuffle(InsertLetter(counter(1,68),'b').concat(InsertLetter(counter(1,68),'m'))),3); // randomize beach and mountain

let RpPlusExem = InsertLetter(chance1.shuffle(counter(1,15)),'plus');
let RpMinusExem = InsertLetter(chance1.shuffle(counter(1,75)),'o');
let LuresExem1 = InsertLetter(counter(1,15),'lure');
let LuresExem2 = InsertLetter(counter(16,30),'lure');

let RpPlusTriplets = [];
let NrpTriplets = InsertLetter(chance1.shuffle(counter(1,90)),'nrp');
RpPlusTriplets = Sandwich(RpPlusExem,RpMinusExem.slice(0,30));
RpMinusTriplets = RpMinusExem.slice(30,75);

let AllImages = [];
AllImages = chance1.shuffle(AllImages.concat(RpPlusTriplets,RpMinusTriplets,NrpTriplets));

[Triplets,Triplets2] = repmat2(ThreeSlice(RpPlusTriplets,RpMinusTriplets,NrpTriplets),5);

let PracImages = [];
PracImages = PracImages.concat(chance1.shuffle([].concat.apply(LuresExem1, RpPlusExem)),chance1.shuffle([].concat.apply(LuresExem2, RpPlusExem)))

StudyArray = [];
aa=0;bb=0;cc=0;dd=0;ee=0;ff=0;
for (var i = 0; i < Triplets.length; i++) {
  ff++
  if (Triplets[i].includes("plus")) {
    StudyArray.push(Triplets[i]); aa++
  } else if (Triplets[i].includes("nrp") && Triplets2.includes(Triplets[i])) {
    StudyArray.push("d2"+Triplets[i]); bb++
  } else if (Triplets[i].includes("o") && Triplets[i+1].includes("plus")) {
    StudyArray.push("pos1minus"+Triplets[i]); cc++
  } else if (i==0){
    StudyArray.push("d1"+Triplets[i]); ee++
  } else if (Triplets[i].includes("o") && Triplets[i-1].includes("plus")) {
    StudyArray.push("pos3minus"+Triplets[i]); dd++
  } else {
    StudyArray.push("d1"+Triplets[i]); ee++
  }
}
StudyArrayFull = [];
for (var i = 0; i < StudyArray.length; i++) {
  if (StudyArray[i].includes("d1") && i%3==0) {
    StudyArrayFull.push("pos1" + StudyArray[i]);
  } else if (StudyArray[i].includes("d1") && i%3==1) {
    StudyArrayFull.push("pos2" + StudyArray[i]);
  } else if (StudyArray[i].includes("d1") && i%3==2) {
    StudyArrayFull.push("pos3" + StudyArray[i]);
  } else if (StudyArray[i].includes("d2") && i%3==0) {
    StudyArrayFull.push("pos1" + StudyArray[i]);
  } else if (StudyArray[i].includes("d2") && i%3==1) {
    StudyArrayFull.push("pos2" + StudyArray[i]);
  } else if (StudyArray[i].includes("d2") && i%3==2) {
    StudyArrayFull.push("pos3" + StudyArray[i]);
  } else {
    StudyArrayFull.push(StudyArray[i]);
  }
}

TestArray = [];
for (var i = 0; i < Triplets.length; i++) {
  if (Triplets2.includes(AllImages[i])) {
    if (i%3==0) {
      TestArray.push("pos1d2"+AllImages[i]);
    } else if (i%3==1) {
      TestArray.push("pos2d2"+AllImages[i]);
    } else if (i%3==2) {
      TestArray.push("pos3d2"+AllImages[i]);
    }
  } else {
    if (i%3==0) {
      TestArray.push("pos1d1"+AllImages[i]);
    } else if (i%3==1) {
      TestArray.push("pos2d1"+AllImages[i]);
    } else if (i%3==2) {
      TestArray.push("pos3d1"+AllImages[i]);
    }
  }
}

function repmat(array, count) {
  let result = [];
  while (count--) {
    result = result.concat(array);
  }
  return result;
}

function repmat2(array, count) {
  let result = []; let result2 = [];
  while (count--) {
    result = result.concat(TripScramble(array[0]));
  }
  result2 = array[1];
  return [result,result2];
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
  let result = []; let result2 = [];
  let A = []; let B = []; let C = []; let D = []; let E = [];
  for (let i = 0; i < tripA.length; i=i+3) {
    A[i/3] = tripA.slice(i,i+3);
  }
  for (let i = 0; i < tripB.length; i=i+3) {
    B[i/3] = tripB.slice(i,i+3);
  }
  for (let i = 0; i < tripC.length; i=i+3) {
    C[i/3] = tripC.slice(i,i+3);
  }
  D = D.concat(A,B,C);
  E = E.concat(A,chance1.shuffle(C).slice(0,C.length/2));
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

function TripScramble(array) {
  let result = [];
  let A = [];
  for (let i = 0; i < array.length; i=i+3) {
    A[i/3] = array.slice(i,i+3);
  }
  A = chance1.shuffle(A);
  for (let i = 0; i < A.length; i++) {
    result = result.concat(A[i]);
  }
  return result
}

function ComplexIncludes(array,text){
  for (let i = 0; i < array.length; i++) {
    if (array[i].includes(text)) {
      return array[i]
    }
  }
}
