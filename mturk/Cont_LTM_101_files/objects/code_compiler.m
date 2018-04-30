clc; clear;

code = [];
preset = ['<img id="IDN" src="https://paulscotti.github.io/mturk/Cont_LTM_101_files/objects/Object.png" style="margin-left:-1000px">'];

for i = 319:365
    presetNew = strrep(preset,'Object',['Object',num2str(100+i)]);
    presetNew = strrep(presetNew,'IDN',[num2str(100+i)]);
    code = strcat(code,presetNew);
    presetNew = [];
end



% for i = 1:300
%     imgnumNew = strrep(imgnum,'x',[num2str(100+i)]);
%     imgnumNew = strrep(imgnumNew,'IDN',[num2str(100+i)]);
%     code2 = strcat(code2,imgnumNew);
%     imgnumNew = [];
% end
% code2 = [];
% imgnum = ['x,'];
% for i = 1:51
%     imgnumNew = strrep(imgnum,'x',num2str(0));
%     code2 = strcat(code2,imgnumNew);
%     imgnumNew = [];
% end
% for i = 52:(51+17)
%     imgnumNew = strrep(imgnum,'x',num2str(1));
%     code2 = strcat(code2,imgnumNew);
%     imgnumNew = [];
% end
% for i = (51+17+1):(51+17+17)
%     imgnumNew = strrep(imgnum,'x',num2str(2));
%     code2 = strcat(code2,imgnumNew);
%     imgnumNew = [];
% end
% for i = (51+17+17+1):(51+17+17+17)
%     imgnumNew = strrep(imgnum,'x',num2str(3));
%     code2 = strcat(code2,imgnumNew);
%     imgnumNew = [];
% end