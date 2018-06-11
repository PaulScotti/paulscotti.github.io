imagefiles = dir(fullfile(pwd, ('*.png')));
nfiles = length(imagefiles);    % Number of files found
load('colorwheel360.mat');
for i=1:nfiles
   currentfilename = imagefiles(i).name;
   currentimage = imread([currentfilename]);
   [posterizedimage, alpha] = posterize_paul(currentimage,255,0,0);
   f = imshow(posterizedimage);
%    set(f, 'AlphaData', alpha);
   saveas(f,['zObject' num2str(100+i) '.png']);
end