% PS 2018, originally adapted from Andrew Jahn
 
Conds = {'1','2','3','4','5','6','7','8','9'};
MapNames = {'RedPink' 'RedOrange' 'Orange' 'Olive' 'Green' 'Teal' 'Blue' 'Purple' 'HotPink'};
 
% load onsets and durations for subject (contains trial_onset_list)
try 
    load([root_dir '/scripts/' runName '_scripts.mat']);
catch
    load([root_dir runName '_scripts.mat']);
end
 
mydata.betas=[];mydata.runs=[];mydata.conds=[];mydata.trial=[];mydata.blankbetas=[];
 
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
 
for r = 1:numRuns
    for j = 1:numTrials %for every trial in the run
        %load SPM.mat
        load([root_dir 'Trial' num2str(j) '/SPM.mat']);
        cd([root_dir 'Trial' num2str(j)]);
 
        Betas=[];
        which = find(contains({SPM.Vbeta.descrip},['Sn(' num2str(r) ') Trial']));
 
        condID = imgcolor(r,j);
 
        if isnan(condID)
%             Betas = strvcat(Betas,SPM.Vbeta(which).fname);
%             if ischar(Betas)
%                 P = spm_vol(Betas);
%             end
%  
%             est = spm_get_data(P,XYZ);
%             
%             mydata.blankbetas = [mydata.blankbetas; est];
        else
 
            Betas = strvcat(Betas,SPM.Vbeta(which).fname);
            mydata.trial = [mydata.trial; j];
            mydata.runs = [mydata.runs; r];
            mydata.conds = [mydata.conds; condID];
 
            %Extract beta series time course from ROI
            if ischar(Betas)
                P = spm_vol(Betas);
            end
 
            est = spm_get_data(P,XYZ);
            if any(isnan(est))
                break;
            end
 
            mydata.betas = [mydata.betas; est];
        end
    end
end
cd(root_dir)
save([roi_file '_betas'],'mydata', '-v7.3');
