% PS 2018, originally adapted from Andrew Jahn

Conds = {'1','2','3','4','5','6','7','8','9'};
MapNames = {'RedPink' 'RedOrange' 'Orange' 'Olive' 'Green' 'Teal' 'Blue' 'Purple' 'HotPink'};

% load onsets and durations for subject (contains trial_onset_list)
try 
    load([root_dir '/scripts/' runName '_scripts.mat']);
catch
    load([root_dir runName '_scripts.mat']);
end

mydata.betas=[];mydata.conds=[];mydata.condsX=[];mydata.object=[];mydata.runs=[];

% load subject's ROI
seedroi = [roi_dir roi_file];
fprintf('ROI: %s \n',roi_file);
 
%Find XYZ coordinates of ROI
Y = niftiread(seedroi); % Y is an [x,y,z] matrix
% indx = [1:(size(Y,1)*size(Y,2)*size(Y,3))]';
indx = find(Y>0);
[x,y,z] = ind2sub(size(Y),indx);
XYZ = [x y z]'; 

fprintf('num voxels: %i \n',length(XYZ));

for j = 1:numObjects %for every object
    counter = 0;
    for r = 1:numRuns
        %load SPM.mat
        load([root_dir 'Object' num2str(j) '/SPM.mat']);
        cd([root_dir 'Object' num2str(j)]);

        Betas=[];
        which = find(contains({SPM.Vbeta.descrip},['Sn(' num2str(r) ') Object']));

        if isempty(which)
            continue;
        end

        condIDexact = num_color_key(j); %exact color

        [minValue,closestIndex] = min(abs(num_color_key(j)-[0:40:320]));
        condID = closestIndex;

        if isnan(condID)
        else
            counter = counter + 1;
            
            mydata.object = [mydata.object; j];
            mydata.conds = [mydata.conds; condID];
            mydata.condsX = [mydata.condsX; condIDexact];
            mydata.runs = [mydata.runs; r];

            Betas = strvcat(Betas,SPM.Vbeta(which).fname);
            if ischar(Betas)
                P = spm_vol(Betas);
            end

            est = spm_get_data(P,XYZ);
    %             est = est(~isnan(est));

            mydata.betas = [mydata.betas; est];
        end
    end
end
cd(root_dir)
save([roi_file '_obj_betas'],'mydata', '-v7.3');
%     save([roi_file{nROI} '_obj_betas'],'mydata');