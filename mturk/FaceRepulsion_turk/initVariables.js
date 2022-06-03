let CDSet = chance1.shuffle(repmat(perm_concat([0,1],counter(1,25)),4)); // randomized 200 CD trials

let objectsnum = chance1.shuffle(counter(1,200))

let pad = "000"
let objects = []
for (let i = 0; i < objectsnum.length; i++) {
  str = String(objectsnum[i])
  objects.push(pad.substring(0, pad.length - str.length) + str)
}

let StudyTrialType = [];
StudyTrialType = StudyTrialType.concat(repmat(2, numStudy/2), repmat(6, numStudy/2));
StudyTrialType = chance1.shuffle(StudyTrialType);

let TestTrialType = [];
TestTrialType = TestTrialType.concat(repmat(2, numStudy/2), repmat(5, numStudy/2), repmat(6, numStudy/2), repmat(7, numStudy/2));
TestTrialType = chance1.shuffle(TestTrialType);

let Nrp = objects.slice(0,50); // 2
let NrpTestLures = objects.slice(50,100); // 5
let Forget = objects.slice(100,150); // 6 
let ForgetLures = objects.slice(150,200); // 7
let AllImages = [];
AllImages = AllImages.concat(Nrp,NrpTestLures,Forget,ForgetLures);

let Nrp_StudyOrder = [];
let Forget_StudyOrder = [];

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
