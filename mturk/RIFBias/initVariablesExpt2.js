let CDSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,25)),4)); // randomized 200 CD trials

let Cats = chance1.shuffle([01,02,04,06,08,09,10,11,15]); // 9 cats

let RpCatsR = Cats.slice(0,3); // 3 categories
let NrpCatsR = Cats.slice(3,6);
let CatchCatsR = Cats.slice(6,9); // 3 cat

let RpExemSliceR = chance1.shuffle(counter(11, 26));
let RpPlusExemR = RpExemSliceR.slice(0, 4); //type 10
let RpMinusExemR = RpExemSliceR.slice(4, 8); //type 11
let PracLuresExemR = RpExemSliceR.slice(8, 16); //type 13
let RpTestLuresExemR = RpExemSliceR.slice(8, 16); //type 14
let NrpExemSliceR = chance1.shuffle(counter(11, 26));
let NrpExemR = NrpExemSliceR.slice(0, 8); //type 12
let NrpTestLuresExemR = NrpExemSliceR.slice(8, 16); //type 15
let CatchExemR = counter(11, 18);

let StudyTrialType = []; let StudyAr = [];
StudyAr = StudyAr.concat(repmat(repmat([10, 11], RpPlusExemR.length),RpCatsR.length), repmat(repmat(12, NrpExemR.length), NrpCatsR.length), repmat(repmat(99, CatchExemR.length), 1));
StudyTrialType = StudyTrialType.concat(chance1.shuffle(StudyAr),chance1.shuffle(StudyAr),chance1.shuffle(StudyAr));
while (StudyTrialType.slice(0,1)==99) {
  StudyTrialType = [];
  StudyTrialType = StudyTrialType.concat(chance1.shuffle(StudyAr),chance1.shuffle(StudyAr),chance1.shuffle(StudyAr));
}

let PracTrialType = [];
PracTrialType = PracTrialType.concat(repmat(repmat(10, RpPlusExemR.length), RpCatsR.length), repmat(repmat(10, RpPlusExemR.length), RpCatsR.length), repmat(repmat(10, RpPlusExemR.length), RpCatsR.length));
PracTrialType = chance1.shuffle(PracTrialType);

let TestTrialType = [];
TestTrialType = TestTrialType.concat(repmat(repmat([10, 11], RpPlusExemR.length), RpCatsR.length), repmat(repmat(12, NrpExemR.length), NrpCatsR.length));
TestTrialType = chance1.shuffle(TestTrialType);

// let RandStart = Math.floor(chance1.random()*360)+1; // random number from 1 to 360

let RpPlusR = chance1.shuffle(perm_concat(RpCatsR,RpPlusExemR));
let RpPlusPracR = [];
RpPlusPracR = RpPlusPracR.concat(chance1.shuffle(perm_concat(RpCatsR,RpPlusExemR)),chance1.shuffle(perm_concat(RpCatsR,RpPlusExemR)),chance1.shuffle(perm_concat(RpCatsR,RpPlusExemR))); //thrice because of three practice trials
let RpMinusR = chance1.shuffle(perm_concat(RpCatsR,RpMinusExemR));
let NrpR = chance1.shuffle(perm_concat(NrpCatsR,NrpExemR));
let CatchR = chance1.shuffle(perm_concat(CatchCatsR,CatchExemR));
let RpTestLuresR = chance1.shuffle(perm_concat(RpCatsR,RpTestLuresExemR));
let NrpTestLuresR = chance1.shuffle(perm_concat(NrpCatsR,NrpTestLuresExemR));

let numpercat = NrpR.length/NrpCatsR.length;

var RpPlusRC = new Array();
var RpPlusRind = new Array();
for (var i = 0; i < RpCatsR.length; i++) {
  RpPlusRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat/2));
}
var RpMinusRC = new Array();
for (var i = 0; i < RpCatsR.length; i++) {
  RpMinusRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat/2));
}
var NrpRC = new Array();
for (var i = 0; i < NrpCatsR.length; i++) {
  NrpRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat));
}
var CatchRC = new Array();
for (var i = 0; i < CatchCatsR.length; i++) {
  CatchRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat));
}
var RpTestLuresRC = new Array();
for (var i = 0; i < RpCatsR.length; i++) {
  RpTestLuresRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat));
}
var NrpTestLuresRC = new Array();
for (var i = 0; i < NrpCatsR.length; i++) {
  NrpTestLuresRC[i] = wrap(RandStart(counter(1,360,360/numpercat)).slice(0,numpercat));
}

var CatIndx = new Array(); var ExemIndx = new Array(); var CIndx = new Array();
CatIndx[0] = RpCatsR; CatIndx[1] = NrpCatsR; CatIndx[2] = CatchCatsR;
ExemIndx[0] = RpPlusExemR; ExemIndx[1] = RpMinusExemR; ExemIndx[2] = NrpExemR; ExemIndx[3] = CatchExemR;
CIndx[0] = RpPlusRC; CIndx[1] = RpMinusRC; CIndx[2] = NrpRC; CIndx[3] = CatchRC;

let AllImages = [];
AllImages = AllImages.concat(RpPlusR,RpMinusR,NrpR,CatchR,RpTestLuresR,NrpTestLuresR);

ObjIndx = new Object();
for (var a = 0; a < AllImages.length; a++) {
  ObjIndx[a] = new Object();
  ObjIndx[a].id = AllImages[a];
  ObjIndx[a].cat = AllImages[a].slice(0,2);
  ObjIndx[a].exem = AllImages[a].slice(3,5);
  ObjIndx[a].img = new Image();
  ObjIndx[a].img.crossOrigin = "anonymous";
  ObjIndx[a].img.id = AllImages[a];
  ObjIndx[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndx[a].type = 0;
    ObjIndx[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndx[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndx[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndx[a].type = 1;
    ObjIndx[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndx[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndx[a].exem))]
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndx[a].type = 2;
    ObjIndx[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndx[a].cat))][NrpExemR.indexOf(parseInt(ObjIndx[a].exem))]
  } else if (CatchR.includes(AllImages[a])) {
    if (CatchR.indexOf(AllImages[a]) < 6) {
      ObjIndx[a].type = 3;
      ObjIndx[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx[a].exem))]
    } else {
      ObjIndx[a].type = 3;
      ObjIndx[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx[a].exem))]
      ObjIndx[a].null = 1;
    }
  } else {
    ObjIndx[a].null = 1;
  }
  if (ObjIndx[a].null == undefined) {
    ObjIndx[a].null = 0;
  }
}

ObjIndx2 = new Object();
for (var a = 0; a < AllImages.length; a++) {
  ObjIndx2[a] = new Object();
  ObjIndx2[a].id = AllImages[a];
  ObjIndx2[a].cat = AllImages[a].slice(0,2);
  ObjIndx2[a].exem = AllImages[a].slice(3,5);
  ObjIndx2[a].img = new Image();
  ObjIndx2[a].img.crossOrigin = "anonymous";
  ObjIndx2[a].img.id = AllImages[a];
  ObjIndx2[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndx2[a].type = 0;
    ObjIndx2[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndx2[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndx2[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndx2[a].type = 1;
    ObjIndx2[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndx2[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndx2[a].exem))]
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndx2[a].type = 2;
    ObjIndx2[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndx2[a].cat))][NrpExemR.indexOf(parseInt(ObjIndx2[a].exem))]
  } else if (CatchR.includes(AllImages[a])) {
    if (CatchR.indexOf(AllImages[a]) >= 6 && CatchR.indexOf(AllImages[a]) < 12) {
      ObjIndx2[a].type = 3;
      ObjIndx2[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx2[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx2[a].exem))]
    } else {
      ObjIndx2[a].type = 3;
      ObjIndx2[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx2[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx2[a].exem))]
      ObjIndx2[a].null = 1;
    }
  } else {
    ObjIndx2[a].null = 1;
  }
  if (ObjIndx2[a].null == undefined) {
    ObjIndx2[a].null = 0;
  }
}

ObjIndx3 = new Object();
for (var a = 0; a < AllImages.length; a++) {
  ObjIndx3[a] = new Object();
  ObjIndx3[a].id = AllImages[a];
  ObjIndx3[a].cat = AllImages[a].slice(0,2);
  ObjIndx3[a].exem = AllImages[a].slice(3,5);
  ObjIndx3[a].img = new Image();
  ObjIndx3[a].img.crossOrigin = "anonymous";
  ObjIndx3[a].img.id = AllImages[a];
  ObjIndx3[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndx3[a].type = 0;
    ObjIndx3[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndx3[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndx3[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndx3[a].type = 1;
    ObjIndx3[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndx3[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndx3[a].exem))]
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndx3[a].type = 2;
    ObjIndx3[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndx3[a].cat))][NrpExemR.indexOf(parseInt(ObjIndx3[a].exem))]
  } else if (CatchR.includes(AllImages[a])) {
    if (CatchR.indexOf(AllImages[a]) >= 12 && CatchR.indexOf(AllImages[a]) < 18) {
      ObjIndx3[a].type = 3;
      ObjIndx3[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx3[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx3[a].exem))]
    } else {
      ObjIndx3[a].type = 3;
      ObjIndx3[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx3[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx3[a].exem))]
      ObjIndx3[a].null = 1;
    }
  } else {
    ObjIndx3[a].null = 1;
  }
  if (ObjIndx3[a].null == undefined) {
    ObjIndx3[a].null = 0;
  }
}

ObjIndx4 = new Object();
for (var a = 0; a < AllImages.length; a++) {
  ObjIndx4[a] = new Object();
  ObjIndx4[a].id = AllImages[a];
  ObjIndx4[a].cat = AllImages[a].slice(0,2);
  ObjIndx4[a].exem = AllImages[a].slice(3,5);
  ObjIndx4[a].img = new Image();
  ObjIndx4[a].img.crossOrigin = "anonymous";
  ObjIndx4[a].img.id = AllImages[a];
  ObjIndx4[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndx4[a].type = 0;
    ObjIndx4[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndx4[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndx4[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndx4[a].type = 1;
    ObjIndx4[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndx4[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndx4[a].exem))]
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndx4[a].type = 2;
    ObjIndx4[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndx4[a].cat))][NrpExemR.indexOf(parseInt(ObjIndx4[a].exem))]
  } else if (CatchR.includes(AllImages[a])) {
    if (CatchR.indexOf(AllImages[a]) >= 18) {
      ObjIndx4[a].type = 3;
      ObjIndx4[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx4[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx4[a].exem))]
    } else {
      ObjIndx4[a].type = 3;
      ObjIndx4[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndx4[a].cat))][CatchExemR.indexOf(parseInt(ObjIndx4[a].exem))]
      ObjIndx4[a].null = 1;
    }
  } else {
    ObjIndx4[a].null = 1;
  }
  if (ObjIndx4[a].null == undefined) {
    ObjIndx4[a].null = 0;
  }
}

ObjIndxP = new Object();
for (var a = 0; a < AllImages.length; a++) {
  ObjIndxP[a] = new Object();
  ObjIndxP[a].id = AllImages[a];
  ObjIndxP[a].cat = AllImages[a].slice(0,2);
  ObjIndxP[a].exem = AllImages[a].slice(3,5);
  ObjIndxP[a].img = new Image();
  ObjIndxP[a].img.crossOrigin = "anonymous";
  ObjIndxP[a].img.id = AllImages[a];
  ObjIndxP[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndxP[a].type = 0;
    ObjIndxP[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndxP[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndxP[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndxP[a].type = 1;
    ObjIndxP[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndxP[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndxP[a].exem))]
    ObjIndxP[a].null = 1;
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndxP[a].type = 2;
    ObjIndxP[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndxP[a].cat))][NrpExemR.indexOf(parseInt(ObjIndxP[a].exem))]
    ObjIndxP[a].null = 1;
  } else if (CatchR.includes(AllImages[a])) {
    ObjIndxP[a].type = 3;
    ObjIndxP[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndxP[a].cat))][CatchExemR.indexOf(parseInt(ObjIndxP[a].exem))]
    ObjIndxP[a].null = 1;
  } else {
    ObjIndxP[a].null = 1;
  }
  if (ObjIndxP[a].null == undefined) {
    ObjIndxP[a].null = 0;
  }
}

ObjIndxT = new Object();
for (var a = 0; a < AllImages.length; a++) {a
  ObjIndxT[a] = new Object();
  ObjIndxT[a].id = AllImages[a];
  ObjIndxT[a].cat = AllImages[a].slice(0,2);
  ObjIndxT[a].exem = AllImages[a].slice(3,5);
  ObjIndxT[a].img = new Image();
  ObjIndxT[a].img.crossOrigin = "anonymous";
  ObjIndxT[a].img.id = AllImages[a];
  ObjIndxT[a].img.src = $('#Obj' + AllImages[a])[0].src;
  if (RpPlusR.includes(AllImages[a])) {
    ObjIndxT[a].type = 0;
    ObjIndxT[a].color = RpPlusRC[RpCatsR.indexOf(parseInt(ObjIndxT[a].cat))][RpPlusExemR.indexOf(parseInt(ObjIndxT[a].exem))]
  } else if (RpMinusR.includes(AllImages[a])) {
    ObjIndxT[a].type = 1;
    ObjIndxT[a].color = RpMinusRC[RpCatsR.indexOf(parseInt(ObjIndxT[a].cat))][RpMinusExemR.indexOf(parseInt(ObjIndxT[a].exem))]
  } else if (NrpR.includes(AllImages[a])) {
    ObjIndxT[a].type = 2;
    ObjIndxT[a].color = NrpRC[NrpCatsR.indexOf(parseInt(ObjIndxT[a].cat))][NrpExemR.indexOf(parseInt(ObjIndxT[a].exem))]
  } else if (CatchR.includes(AllImages[a])) {
    ObjIndxT[a].type = 3;
    ObjIndxT[a].color = CatchRC[CatchCatsR.indexOf(parseInt(ObjIndxT[a].cat))][CatchExemR.indexOf(parseInt(ObjIndxT[a].exem))]
    ObjIndxT[a].null = 1;
  } else if (RpTestLuresR.includes(AllImages[a])) {
    ObjIndxT[a].type = 4;
    ObjIndxT[a].color = RpTestLuresRC[RpCatsR.indexOf(parseInt(ObjIndxT[a].cat))][RpTestLuresExemR.indexOf(parseInt(ObjIndxT[a].exem))]
    ObjIndxT[a].null = 0;
  } else if (NrpTestLuresR.includes(AllImages[a])) {
    ObjIndxT[a].type = 5;
    ObjIndxT[a].color = NrpTestLuresRC[NrpCatsR.indexOf(parseInt(ObjIndxT[a].cat))][NrpTestLuresExemR.indexOf(parseInt(ObjIndxT[a].exem))]
    ObjIndxT[a].null = 0;
  }
  if (ObjIndxT[a].null == undefined) {
    ObjIndxT[a].null = 0;
  }
}

StudyTrials=[];
StudyTrials = StudyTrials.concat(fisherYates(ObjIndx,AllImages.length),fisherYates(ObjIndx2,AllImages.length),fisherYates(ObjIndx3,AllImages.length),fisherYates(ObjIndx4,AllImages.length));
while (StudyTrials[0][0].type==3 || StudyTrials[1][0].type==3 || StudyTrials[2][0].type==3 || StudyTrials[3][0].type==3 ||
        StudyTrials[0][1].type==3 || StudyTrials[1][1].type==3 || StudyTrials[2][1].type==3 || StudyTrials[3][1].type==3 ||
        StudyTrials[0][2].type==3 || StudyTrials[1][2].type==3 || StudyTrials[2][2].type==3 || StudyTrials[3][2].type==3 ||
        StudyTrials[0][3].type==3 || StudyTrials[1][3].type==3 || StudyTrials[2][3].type==3 || StudyTrials[3][3].type==3 ||
        StudyTrials[0][4].type==3 || StudyTrials[1][4].type==3 || StudyTrials[2][4].type==3 || StudyTrials[3][4].type==3 ||
        StudyTrials[0][5].type==3 || StudyTrials[1][5].type==3 || StudyTrials[2][5].type==3 || StudyTrials[3][5].type==3){
  StudyTrials=[];
  StudyTrials = StudyTrials.concat(fisherYates(ObjIndx,AllImages.length),fisherYates(ObjIndx2,AllImages.length),fisherYates(ObjIndx3,AllImages.length),fisherYates(ObjIndx4,AllImages.length));
}
PracticeTrials=[];
PracticeTrials = PracticeTrials.concat(fisherYates(ObjIndxP,AllImages.length),fisherYates(ObjIndxP,AllImages.length),fisherYates(ObjIndxP,AllImages.length));
TestTrials = fisherYates(ObjIndxT,AllImages.length,3);

let RpPlusR_StudyOrder = [];
let RpMinusR_StudyOrder = [];
let NrpR_StudyOrder = [];

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
      if (array1[i] < 10) {
        result = result.concat('0' + array1[i].toString() + '_' + array2[j].toString());
      } else {
        result = result.concat(array1[i].toString() + '_' + array2[j].toString());
      }
    }
  }
  return result;
}

/* Make sure number is between 0 and 360: */
function wrap(v) {
    for (let i = 0; i < v.length; i++) {
        if (v[i] > 360) {
            v[i] -= 360;
        }
        if (v[i] < 0) {
            v[i] += 360;
        }
    }
    for (let i = 0; i < v.length; i++) {
        if (v[i] > 360) {
            v[i] -= 360;
        }
        if (v[i] < 0) {
            v[i] += 360;
        }
    }
    if (v.length == undefined) {
        if (v > 360) {
            v -= 360;
        }
        if (v < 0) {
            v += 360;
        }
        if (v > 360) {
            v -= 360;
        }
        if (v < 0) {
            v += 360;
        }
        if (v > 360) {
            v -= 360;
        }
        if (v < 0) {
            v += 360;
        }
        v = parseInt(v); // v becomes integer and not array
    }
    return v;
}

function RandStart(array) {
  v = Math.floor(chance1.random()*360)+1;
  for (let i = 0; i < array.length; i++) {
    array[i] = array[i] + v;
  }
  return array;
}
function fisherYates(array,length) {
  for (let i = 0; i < length; i++) {
     var j = Math.floor(chance1.random() * ( i + 1 ) );
     var tempi = array[i];
     var tempj = array[j];
     array[i] = tempj;
     array[j] = tempi;
   }
   return array;
}
