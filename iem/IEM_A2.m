% PS IEM ContLTM 2018/2019, with much help thanks to Emma Wu Dowd, Julie Golomb, and Tommy Sprague
close all;
clear all;
subjID = 101;

%% Load betas from ROI (some functions require MATLAB 2019a or later!!)
% loads in whole-brain mydata, constrain voxels using ROI mask

ROI = 'LOC'; %ColorROIs V1 V4v LOC

load('/Volumes/Passport/ContLTM_IEM/101/Session_1/MPRAGE/S2_mydata.mat');
MPRAGE = niftiread('/Volumes/Passport/ContLTM_IEM/101/Session_1/MPRAGE/sub-101_space-MNI152NLin2009cAsym_desc-preproc_T1w.nii');
indx = find(MPRAGE>0);
mask = niftiread(strcat('/Volumes/Passport/ContLTM_IEM/101/Session_1/ROIs/',ROI,'.nii'));
indx2 = find(mask>0);
indx(ismember(indx,indx2)) = -999;
mydata.betas = mydata.betas(:,indx==-999);

NaNIndx = any(isnan(mydata.betas));
mydata.betas = mydata.betas(:,~NaNIndx);

clear MPRAGE; clear mask;

% how many voxels are in this ROI?
fprintf('num voxels: %i \n',size(mydata.betas,2));

%% Create basis set
mydata.condsX = []; lst=[0:40:320];
for i = 1:length(mydata.conds)
    [minValue,closestIndex] = min(abs(mydata.conds(i)-lst));
    mydata.condsX = [mydata.condsX; lst(closestIndex)];
end

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

%% Generate design matrix
desMat = stim_mask*basis_set;

% Plot predicted channel response for sample trial 
tr_num = 1;
figure
plot(rad2deg(chan_center_rad),desMat(tr_num,:),'k-');
hold on;
for cc = 1:n_ori_chans
    plot(rad2deg(chan_center_rad(cc)),desMat(tr_num,cc),'o','MarkerSize',8,'LineWidth',3);
end
xlabel('Channel center (\circ)');
title(['Predicted channel response for trial ' num2str(tr_num)]);

% Plot design matrix across trials
figure
imagesc(rad2deg(chan_center_rad),1:size(desMat(:,:),1),desMat(:,:));
colormap(gray);
xticks([0:180/n_ori_chans:180]); 
title('Design matrix');
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
        ps(ii) = anova1(mydata.betas(trnIdx,ii),mydata.condsX(trnIdx),'off');
    end
    
    % only use voxels that were top x%, determined by one-way anova
    which_vox = ps <= prctile(ps,vox_prctile);
    
    trnX = mydata.betas(trnIdx,which_vox);
    tstX = mydata.betas(tstIdx,which_vox);
    
    weights = desMat(trnIdx,:)\trnX;
    
    % compare trained channel weights to actual beta weights for each test trial
    chan_resp(tstIdx,:) = (inv(weights*weights')*weights*tstX').';
end

figure
% plot weights for 3 voxels
subplot(3,1,1)
plot(weights(:,1:3),'o-')
xlabel('Channel'); ylabel('Weight');
title('Sample trained channel weights for 3 voxels');

% plot reconstructed channel response for sample trial 
subplot(3,1,2)
plot(chan_resp(tr_num,:))
xlabel('Channel'); 
ylabel('BOLD Z-score'); 
title(['Reconstructed channel response for sample trial ' num2str(tr_num)]);

% how well did it do? compare to predicted channel response (design matrix) 
subplot(3,1,3)
plot(desMat(tr_num,:),'k-');
xlabel('Channel center'); 
ylabel('Sensitivity'); 
title(['Predicted (true) channel response for sample trial ' num2str(tr_num)]);

%% Combine across channel response functions
ou = unique(mydata.condsX); 
ou = ou(~isnan(ou));
targ_chan = ceil(n_ori_chans/2);

chan_resp_shift = [];
for ii = 1:size(chan_resp,1)
    if ~isnan(mydata.conds(ii))
        chan_resp_shift(end+1,:) = circshift(chan_resp(ii,:),targ_chan-find(ou==mydata.condsX(ii)),2);
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
% ylim([.2 round(max(mean(chan_resp_shift))+.01,2)]);
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

print(strcat('A2_',ROI,'.png'),'-dpng');
