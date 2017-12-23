clc; clear;

code = [];
preset = ['<img id="IDN" src="https://paulscotti.github.io/mturk/Cont_LTM_101_files/objects/Object.jpg" style="margin-left:-1000px">'];

for i = 1:354
    presetNew = strrep(preset,'Object',['Object',num2str(100+i)]);
    presetNew = strrep(presetNew,'IDN',[num2str(100+i)]);
    code = strcat(code,presetNew);
    presetNew = [];
end

code2 = [];
imgnum = ['x,'];

for i = 1:300
    imgnumNew = strrep(imgnum,'x',[num2str(100+i)]);
    imgnumNew = strrep(imgnumNew,'IDN',[num2str(100+i)]);
    code2 = strcat(code2,imgnumNew);
    imgnumNew = [];
end