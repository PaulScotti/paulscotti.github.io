---
layout: post
title:  "Expectation in perceptual decision making"
date:   2018-02-06
excerpt: "Review of Summerfield & de Lange (2014)."
comments: true
---
Not sure whether to call this a review, a summary, or something else. This is basically me writing the most important parts of the article down, adding relevant citations, and sprinkling some personal commentary throughout.

# How does expectation modulate neural signals and behavior?
Our world is very structured, both in time and space.

Spatial context:
If you see grass and a greenhouse, you may be more likely to expect a lawnmower than an armchair. A jumbled background can impair object recognition. Objects are also detected more slowly and incorrectly when unexpected in terms of size or position. An object can actually be larger in a scene and be harder to find than if it were smaller, if that smaller version was a more expected size for that particular object (Eckstein et al., 2017).

However, typically psychophysical experiments carefully counterbalance and equate the probability of manipulations. This ensures that stimuli cannot be predicted on the basis of past occurrences. But realistically, predictions based on past occurrences happen all the time in perception -- we enter a friend's house to meet their pet, likely anticipating a dog or a cat and not an alligator.

In language, infants learn transitional probabilities between sensory events, in which statistical learning facilitates language acquisition.

The visual system capitalizes on information about stimulus frequency, conditional probability, and temporal autocorrelation in the visual signal to build expectations about forthcoming sensory information. The question now is how does the brain computationally build these expectations, how does this information integrate with perceptual decision-making, and how does this information play into attention and adaptation literature?

# Perceptual decision-making
How does information about what is probable and what is present combine to optimize perception?

Two formal models of perceptual choice include signal detection theory and the drift diffusion model (a sequential sampling model).

Either way, they both suggest that some additive offset in pre-stimulus evidence levels is to account for the effect of expectations in perceptual decisions.

# Pre-stimulus neural bias

The models propose an early, additive bias to evidence integration. How would this happen in the brain? Perhaps by modulation in baseline neural activity.

We can put electrodes in macaque parietal and prefrontal cortices during random dot kinematogram discrimination tasks to observe tally of evidence in favor of one saccadic response over another. Critically, baseline responses in these neurons are biased by the probability of stimulus occurrence. Comparably, in humans, decision-related build-up activity has been observed in the form of steady increases in lateralized oscillatory activity recorded using MEG. In a study combining modeling and fMRI, individual differences in the best-fitting origin of diffusion predict BOLD signals in frontal and parietal cortices during RDK discrimination.

In non decision-related and motor regions, responses of sensory neurons are also biased by expectations in pre-stimulus period. During visual associative learning (one visual stimulus predicts the next), neurons encoding the expected stimulus in both IT and MT become active.

Macroscopically, cues predicting occurrence of a visual stimulus lead to increased BOLD in category-specific extrastriate regions. E.g., when 'FACE' predicts subsequent face display, it provokes higher BOLD in fusiform gyrus.

Pre-stimulus BOLD in extrastriate visual cortex can predict whether observers will judge Rubin's vase illusion to be a face or a vase, or whether they will decide dots are moving coherently or randomly. In the absence of stimuli, when an expected visual grating is omitted, the omission evokes a neural activity pattern in EVC similar to that of the actual stimulus, suggesting prior expectation triggers formation of stimulus-specific templates.

Therefore, expectations may bias neural activity in sensory cortices, pushing the interpretation of sensory information towards one perceptual hypothesis or another.

# Neural signatures of expectations
It was originally thought that expectation may be implemented via a time-varying bias that ensures that the prior has the greatest influence on the trials with the longest response time. This would be consistent with a Bayesian perspective in which prior information should hold more sway when evidence in ambiguous.

However, this is complicated by "expectation suppression" findings. Expected stimuli tend to dampen BOLD and reduce amplitude of cortical potentials. Also, oddball responses to visual stimuli have also been reported in which larger responses to stimuli rendered unexpected by cues or context rule out explanations based on habituation alone.

In one study, faces or building were shown, cued by an associated color stimulus. When a face was not presented, FFA BOLD was strongest when face was expected. However, in the context of a face stimulus, stronger BOLD was observed for unexpected faces than expected faces -- an expectation suppression effect. (Note that this is different from repetition suppression, they have different time courses among other factors.) In other words, expectation causes changes in neural activity that occur before and during presentation of a visual stimulus.

# Predictive Coding
Is the sequential sampling framework overly simplistic? It may be overlooking some important neurophysiology of our sensory system. For example, visual system is hierarchically organized, and receptive fields increase in size and complexity with subsequent processing stages. Also, message passing is reciprocal between adjacent stages and in most cases backwards projections outnumber forwards projections.

A more neurobiologically plausible theory is predictive coding (which can be traced back all the way to Helmholtz), which seeks to account for these neurophysiological features while preserving the iterative Bayesian framework. Here, evidence accumulation is less like a diffusing between symmetric bounds, but more like an evolving probability distribution over multiple possible causes of sensation. Causes are represented over several hierarchically organized levels, with greater complexity at higher stages (e.g., faces) than lower stages (e.g., oriented lines). In other words, predictive coding proposes that perception is a consequence of building and refining a generative model of the causes of sensation.

A prediction error term (equivalent to likelihood term in drift diffusion) is the result of comparison between predicted and observed inputs, flowing forward to gradually adjust belief at subsequent processing stages, via Kalman filtering process. Neural activity elicited by expected events is thus explained away by backwards flowing (predictive information from subsequent processing stage), which makes sense with expectation suppression.

Predictive coding explains how visual responses are modulated by context. Neurons in V1 display 'end stopping' -- paradoxical effect that a neuron ceases to respond to an optimally oriented stimulus if the size of the stimulus extends beyond neuron's classical receptive field. The neuron's response is 'explained away' by feedback signals from neurons at a subsequent stage, which are able to pool inputs over a larger retinal area. Rao and Ballard constructed a hierarchical model using this theory on a bank of natural images -- the filters that developed matched the rf of neurons in the visual system closely and displayed end stopping too.

Predictive coding also explains how early visual neurons respond to illusory contours of the Kanizsa triangle, neurons are responding based on suggested contextual elements. Subjects viewed natural images in which one quadrant was obscured, then authors examined cortical representation of the obscured quadrant using MVPA and were able to decode the identity of the image. Illusory motion can also generate BOLD response in V1 that responds to the retinotopic location in the absence of any motion input, explainable by feedback from MT.

More concrete evidence: end stopping is eliminated following cooling of V2 in squirrel monkeys, meaning inactivation of higher levels of hierarchy disrupt predictions and their neural concomitants at the lower level. In humans, TMS to MT eliminates the detection advantage enjoyed by targets that are predicted by an illusory motion signal, relative to those that are unpredicted.

# Dissociation between attention and expectations

Selective attention is often guided by expectation. Searching for lost keys, you may allocate attention to locations where they are most likely to be found. Expectation facilitates detection and recognition of features, locations, or objects that are likely to be present in the environment. Selective attention facilitates perception by prioritizing sensory inputs according to their salience or task-relevance. So how should expectation and attention be differentiated? Are they computationally dissociable? It's an open question.

Perhaps it may be useful to distinguish manipulations of the probability of sensory events from manipulations of their relevance to the task at hand. Labelling these manipulations as expectation and attention allows us to distinguish the two concepts, because a stimulus can be conditionally probable or not, irrespective of whether it is relevant to behavior. Indeed, during states of inattention, sleep, or anaesthesia, neural modulations of expectation have been observed. Thus, while priors frequently guide attention, attention is not a prerequisite for the biasing effects of expectation on neural processing.

*Question: Are they assuming attention needs to be consciously allocated? What about implicit attentional allocation?*

One suggestion for predictive coding to distinguish these concepts: expectations encode predictions about a feature or location (determining precision of prior distribution), whereas attention allows us to weight sensory information according to its relevance to the current decision (determining precision of error signals that control belief updating). This has been supported via simulations (attention accounts for cue validity effects in Posner task both behaviorally and in EEG). In other words, expectation may determine the origin of evidence accumulation (or prior belief) and attention may control the drift rate (or sensory gain). Also, longstanding psychophysical evidence indicates that probability cues bias subjects to make one response over another, whereas relevance cues render them more sensitive to an attended feature or location. But more recently it has been suggested that cues manipulating probability and relevance of sensory signals may both increase the sensitivity of perceptual decisions, albeit in distinct ways (probability: boost gain of input, meaning most impact for weaker signals; relevance: decrease noise at decision stage, increasing sensitivity most sharply for stronger signals).

There are, however, many different conceptualizations of attention and expectation. Maybe attention diverts processing away from unexpected portions of visual signal. Maybe attention boosts predictions, rather than their violations, making anticipated information more salient. Others have tried to reconcile predictive coding with the biased competition model of attention, just without optimization of precision.

One study manipulated spatial attention and expectation orthogonally, finding that expectation reduced sensory responses in absence of attention but that this pattern reversed in the presence of attention. Thus, attention may reverse expectation suppression by increasing gain of error units. Jiang et al. reasoned that if attention boosts gain (or precision) of error signals, then neural pattern classifiers should be better able to distinguish expected from unexpected signals when stimuli are attended. Alternatively, if attention silences prediction errors, then activity patterns for expected and unexpected stimuli should be more similar. The authors found strong evidence for idea that attention increases gain of prediction errors in category-specific extrastriate regions.

# Stimulus repetition and expectations

Visual signals are temporally autocorrelated, meaning that we can expect information in the visual world to remain stable (that is, to repeat) than to change (that is, to alternate). Expectation suppression might thus partly explain repetition suppression, the well-described attenuation of the neural response elicited by the second and subsequent presentation of a stimulus.

*Could also explain spatial congruency bias?*

Alternatively, RS might be explained by a low-level adaptation to stimulation mediated, for example, by neuronal fatigue alone. To figure this out, one study measured attenuation of BOLD in FFA to repeated faces in contexts where repetitions were either expected or unexpected. Expected repetitions elicited stronger RS, suggesting that the suppression can be partly explained by a reduction in visual prediction error. MEG recordings suggest that RS and expectation suppression may have distinct temporal profiles.

Also note that predictive coding contends that there are segregated signals for expectation and unexpectation (violation), computed at each processing stage. When stimuli are repeatedly presented, one may expected different subpopulations showing RS and RE. Averaging across fusiform, voxels reveal RS and not RE, but this could be due to smoothing/averaging. There is indeed segregated activity patterns for RS and RE in BOLD in FFA during repeated face presentation. At single-cell level, distinct neurons show preferences for matching or nonmatching visual information (2/3 nonmatching typically).

# Expectation as a gain control mechanism
Note that while it may make sense that our sensory system implements a form of Bayesian inference, optimally combining priors and likelihoods to identify the most probable interpretation of the external world, this may be computationally costly. In a Bayesian model, the probability that the knock on my door is Barack Obama is near-zero but possible, meaning that probability is computed alongside that of more plausible options. Adaptation allows resources to be focused on only those alternatives that are expected, given the background information or context.

It is possible that neurons coding for expected information may become more sensitive (and dampened for vice-versa). This expectation-as-sharpening theory predicts that expected stimuli should elicit reduced aggregate neural activity because fewer neurons are activated by a stimulus, but also predicts that neuronal representations should be crisper and easier to decode at the population level. When an auditory tone predicts an oriented grating, the expectation suppression in V1 is accompanied by heightened ability of multivariate classifiers to classify grating orientation. One interpretation of this pattern of activity is that when neurons that code for expected stimuli are pre-activated, they both inhibit units coding for the alternative hypothesis and suppress their own inputs leading to overall sharper expected representations.

# Conclusions
The mechanisms of visual expectation remain poorly characterized at cellular level, hard to differentiate from attention, and it is difficult to understand how the microcircuitry of the visual system allows top-down and bottom-up inputs to be segregated to generate both predictions and prediction errors (perhaps due to laminar differences in cell types, connectivity, oscillations, and neurochemistry may explain this). Also, how do brain regions from which neural signals code expectation arise? The origins of predictive neural signals still remain unknown.

Side note: Predictive coding may explain binocular rivalry. https://www.ncbi.nlm.nih.gov/pubmed/18649876
