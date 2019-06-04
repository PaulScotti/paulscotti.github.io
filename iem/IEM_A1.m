% PS IEM ContLTM 2018/2019, with much help thanks to Emma Wu Dowd, Julie Golomb, and Tommy Sprague
close all;
clear all;
subjID = 101;

%% Load betas from ROI (some functions require MATLAB 2019a or later!!)
% loads in whole-brain mydata, constrain voxels using ROI mask

ROI = 'ColorROIs'; %ColorROIs V1 V4v LOC

load('/Volumes/Passport/ContLTM_IEM/101/Session_1/MPRAGE/S2_mydata.mat');
mydata2 = mydata;
load('/Volumes/Passport/ContLTM_IEM/101/Session_1/MPRAGE/S1_mydata.mat');
MPRAGE = niftiread('/Volumes/Passport/ContLTM_IEM/101/Session_1/MPRAGE/sub-101_space-MNI152NLin2009cAsym_desc-preproc_T1w.nii');
indx = find(MPRAGE>0);
mask = niftiread(strcat('/Volumes/Passport/ContLTM_IEM/101/Session_1/ROIs/',ROI,'.nii'));
indx2 = find(mask>0);
indx(ismember(indx,indx2)) = -999;
mydata.betas = mydata.betas(:,indx==-999);
mydata2.betas = mydata2.betas(:,indx==-999);

NaNIndx = any(isnan(mydata2.betas));
mydata.betas = mydata.betas(:,~NaNIndx);
mydata2.betas = mydata2.betas(:,~NaNIndx);

clear MPRAGE; clear mask;

% how many voxels are in this ROI?
fprintf('num voxels: %i \n',size(mydata.betas,2));

%% Create basis set
mydata.conds = mydata.conds+40; %convert from 0-320 to 40-360 scale
mydata2.conds = within360(mydata2.conds+40)';

n_ori_chans = 9;
nChanPow = n_ori_chans-1;
make_basis_function = @(xrad,mu) (cos(xrad-mu)).^(nChanPow);

xrad = linspace(pi/360,pi,360); %convert everything to radians to work with 180 point sinusoid over feature space
basis_set = nan(360,n_ori_chans);
chan_center_rad = linspace(pi/n_ori_chans,pi,n_ori_chans);

% create basis set composed of 360 color space x 9 channels
for cc = 1:n_ori_chans
    basis_set(:,cc) = make_basis_function(xrad,chan_center_rad(cc));
end

figure
subplot(1,2,1);plot(rad2deg(xrad),basis_set);
xlabel('Color (\circ) reduced to 180 point space');
ylabel('Filter amplitude');
title('Basis set');

% sum channels, should be a single constant value, if not change nChanPow
subplot(1,2,2);plot(xrad,sum(basis_set,2));

%% Build stimulus mask
figure
hold off; 
plot(mydata.conds,'o'); 
xlabel('Trial'); ylabel('Color (deg)'); title('Color Labels');

stim_mask = zeros(size(mydata.conds,1),length(xrad));
for tt = 1:size(stim_mask,1)  % loop over trials
    if ~isnan(mydata.conds(tt))
        stim_mask(tt,mydata.conds(tt))=1;
    end
end

figure
imagesc(stim_mask);
title('Stimulus mask');
xlabel('Color');ylabel('Trial');

% for sess 2
stim_mask2 = zeros(size(mydata2.conds,1),length(xrad));
for tt = 1:size(stim_mask2,1)  % loop over trials
    if ~isnan(mydata2.conds(tt))
        stim_mask2(tt,mydata2.conds(tt))=1;
    end
end

figure
imagesc(stim_mask2);
title('Stimulus mask 2');
xlabel('Color');ylabel('Trial');

%% Generate design matrix
desMat = stim_mask*basis_set;
desMat2 = stim_mask2*basis_set;

% Plot design matrix across trials
figure
imagesc(rad2deg(chan_center_rad),1:size(desMat2(:,:),1),desMat2(:,:));
colormap(gray);
xticks([0:180/n_ori_chans:180]); 
title('Design matrix (mydata2)');
xlabel('Channel center (\circ)');ylabel('Trial'); 

%% Cross-validate and train/test encoding model
vox_prctile = 100; % use top x% of voxels
ru = unique(mydata.runs);
n_runs = length(ru);

chan_resp = nan(size(desMat));

for rr = 1:n_runs
    trnIdx = mydata.runs~=ru(rr);
    tstIdx = mydata.runs==ru(rr);
    
    % identify the training & testing halves of the data: leave-two-runs-out cross-validation
%     ru2 = circshift(ru,-1);
%     trnIdx = mydata.runs ~= ru(rr) & mydata.runs ~= ru2(rr);
%     tstIdx = mydata.runs == ru(rr) | mydata.runs == ru2(rr);
    
    ps = nan(size(mydata.betas,2),1);
    for ii = 1:size(mydata.betas,2)
    % we have 9 groups, corresponding to each channel, and anova1 computes likelihood that all 
    % groups have the same values, and a smaller p-value roughly means that this null is less likely
        ps(ii) = anova1(mydata.betas(trnIdx,ii),mydata.conds(trnIdx),'off');
    end
    
    % only use voxels that were top x%, determined by one-way anova
    which_vox = ps <= prctile(ps,vox_prctile);
    
    trnX = mydata.betas(trnIdx,which_vox);
    tstX = mydata.betas(tstIdx,which_vox);
    
    weights = desMat(trnIdx,:)\trnX;
    
    % Session Two processing
    tstX2 = mydata2.betas(:,which_vox);
    chan_resp2(:,:) = (inv(weights*weights')*weights*tstX2').';
end

%% Combine across channel response functions
ou = unique(mydata2.conds); 
ou = ou(~isnan(ou));
targ_chan = ceil(n_ori_chans/2);

chan_resp_shift = [];
for ii = 1:size(chan_resp2,1)
    if ~isnan(mydata2.conds(ii))
        chan_resp_shift(end+1,:) = circshift(chan_resp2(ii,:),targ_chan-find(ou==mydata2.conds(ii)),2);
    end
end

%% Plot average reconstructed response for all trials
ground_truth_basis = basis_set(:,5);
ground_truth_basis = ground_truth_basis(1:2:length(ground_truth_basis));

figure
plot(rad2deg(chan_center_rad),mean(chan_resp_shift),'LineWidth',5);
hold on;
plot([rad2deg(chan_center_rad(targ_chan)) rad2deg(chan_center_rad(targ_chan))],[0 1],':c','LineWidth',5)
xlabel('Color channel (\circ)','FontSize',14);
ylabel('Channel response (a.u.)','FontSize',14);
% sinusoid basis function goes from 0 to 180, need to convert back over to color space
xticklabels({'-180','-120','-80','-40','0','40','80','120','180'}) 
title('Average reconstructions','FontSize',14);
% ylim([.1 round(max(mean(chan_resp_shift))+.01,2)]);
plot(ground_truth_basis)
ylim([0 1]);
xlim([20 180]);
legend('Model Reconstruction','Aligned, Correct Color','Perfect Reconstruction')

Slopes = [mean([chan_resp_shift(:,1);chan_resp_shift(:,9)]),
    mean([chan_resp_shift(:,2);chan_resp_shift(:,8)]),
    mean([chan_resp_shift(:,3);chan_resp_shift(:,7)]),
    mean([chan_resp_shift(:,4);chan_resp_shift(:,6)]),
    mean([chan_resp_shift(:,5)])];
slope = polyfit(Slopes',min(Slopes):(max(Slopes)-min(Slopes))/4:max(Slopes),1);
slope = slope(1)

% print(strcat('A1_',ROI,'.png'),'-dpng');
