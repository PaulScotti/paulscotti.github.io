---
layout: postx
title:  "Hacking the PhD"
date:   2017-10-21
excerpt: "My experience so far trying to formulate the recipe for high impact publications."
comments: false
---

# Hacking the PhD by Identifying Gaps in Literature
I've put a decent amount of thought into how I can best propel myself into academia. One problem is that may often  happen is someone slaves away on a single focus for 5 years and only produces marginal results from it. Or someone spreads themselves too thin and never finishes any of their projects.

The first step of deciding what to slave over is arguably the most important: what is the research question you wish to devote hundreds of hours into?

To answer this question, we must ask: How does one identify a novel research question that may be most likely to attain high citation counts?

## Step One: Web Crawl the Literature
I recently discovered and modified a web crawler built for google scholar. You feed it some key words and a year range and it spits out the most related papers it finds ordered by citation count. This allows one to sort through "hot" research topics that may be the a good stepping stone in deciding on a novel research question.

As a first step, let's use the keyword "Cognitive Psychology" and limit the year range to papers published after 2010 (because of course papers would be more cited the more time they have been around, which is not the best indicator for a "hot" topic).

<img src="https://puu.sh/y3B4b/29003c94d4.png">

Unfortunately, books are also included in the list and I cannot figure out a way to exclude them. However, books can still be an important insight into what the current trends in research may be. Here are the top 5 results:

1. Neisser (2014): Cognitive psychology: Classic edition
2. Chi (2014) The nature of expertise
3. Gentner & Stevens (2014) Mental models
4. Wyer (2014) The automaticity of everyday life: Advances in social cognition
5. Ellis & Young (2013): Human cognitive neuropsychology: A textbook with readings

Yeah, these results aren't helpful at all are they? We need to be much more specific.

Let's try restricting the earliest year to 2015 and searching for "visual attention fmri". Top 5 results:

1. Humphreys & Riddoch (2016) A Reader in Visual Agnosia
2. Clayton, Yeung, Kadosh (2015) The roles of cortical oscillations in sustained attention
3. Elmer (2015) The control of attention in visual search: Cognitive and neural mechanisms
4. Leibovich, Vogel, Henik, Ansari (2015): Asymmetric processing of numerical and nonnumerical magnitudes in the brain: an fMRI study
5. Kay, Weiner, Grill-Spector (2015): Attention reduces spatial uncertainty in human ventral temporal cortex

That's more like it! So now all I have to do is pick one that's most interesting, and have a fun stroll through the rabbit hole. Although I found all of these articles interesting, I chose to take a closer look at (5).

## Step 2: Digging the Rabbit Hole
The takeaway message from this article was that one can use a pRF model to determine how spatial uncertainty influences VTC activity, and once that becomes measurable they used different attentional tasks to see how this can modulate activation. So whenever I read an article, I ask 2 major questions:

1. What is the high-level takeaway (why does this matter)?
2. What is the mechanism involved?

An easy way to digest this is to list off your high-level points and then support them with evidence, thinking critically about whether this evidence is enough to convince you of their conclusions. Skip to the bullet points for how I applied this to the current article.

First, it's important to first understand what their method is...
In this case, the pRF encoding model fits a model for the pRFs of each voxel (standard phase-encoded retinotopy does not do this). It characterizes the relation between contrast image (location of stimulus) and response from local population. For instance, the model may include a simple 2D gaussian with x and y (center of gaussian, location that drives best activity), as well as sigma (std deviation corresponding to size of pRF). This allows for improved measurements of retinotopic maps in areas with larger receptive fields and allows for analyses looking at changes in receptive field size or laterality.

The authors of this article go a step further by employing compressive spatial summation (CSS; Kay et al. 2013) to account for subadditive summation. In contrast to linear summation, subadditive summation means that the two interacting elements (i.e., stimulus contrast and neural response) return something less than the sum of the values of each element. One would not expect linear summation especially since negative weighting should be applied to stimuli that appear in the surround of a receptive field.

CSS basically says that a model with a small Gaussian can still respond strongly to a stimulus far from the Gaussian if the static nonlinearity is highly compressive. Being highly compressive means that the exponent of the power-law nonlinearity is <1. Therefore, the elements in this model are contrast image (location) and neural responses <i> weighted </i> according to this power-law nonlinearity criteria.

This method does not simply sum contrasts linearly across the visual field. Instead, it more accurately models pRFs via the following steps: stimulus -> convert to contrast image -> project onto 2D Gaussian (x,y,sigma) -> Apply static nonlinearity -> percent change in neural response. Failing to use CSS (i.e., using linear pRF models) can overestimate pRF size when the underlying system exhibits nonlinear subadditive behavior; BOLD response to a contrast pattern is less than the sum of the BOLD responses to individual parts of the contrast pattern.

* Surprisingly, the "what" pathway is modulated by changes in spatial characteristics (position, size)
  * Shown through pRF modeling utilizing not just spatial summation but also compressive nonlinearity (see above)
* Top-down demands (i.e., attention tasks) modulate pRFs in hV4 and higher-level areas. I.e., task-dependent pRFs in VTC.
  * Explicit attention to faces lead to larger response enhancement than implicit attention to faces.
* The common thought that larger pRFs degrade spatial information is misleading.
  * Subjects with good attention to the stimulus induced larger pRFs, and yet their spatial precision with which the location of the stimulus is represented improves, not worsens.
    * This is not counter-intuitive: local scale the information is worse (each voxel is less sensitive) but on global scale sensitivity improves due to increased coverage

These authors were also nice enough to suggest some further avenues of research, namely, how does the demonstrated impact of attention on cortical responses reflect behavior? May affect judgments of spatial position or specifically, reduction of spatial uncertainty during the dot and face tasks compared to the digit task would suggest that behavioral judgments of face position would be more accurate during the dot and face tasks, testable in behavioral studies.

## Step 3: Navigating the Rabbit hole
It's obviously not enough to read one high-impact paper and have an epiphany about some amazing research question that nobody else has explored. We need to do some other reading. But where to look next? Well if we again turn to google scholar, and this time look at studies that cited the study we just read, we might find something a new perspective through related readings.

One interesting article to come up from this lit search:
1. Watson, Young, & Andrews (2016): Spatial properties of objects predict patterns of neural response in the ventral visual pathway
  * Distinct neural patterns to different object categories in VTC
  * Previous studies have suggested VTC may be sensitive to spatial properties of the visual scene, but this has not been clear if this reflects modification of the underlying categorical organization based on the way natural object categories are viewed or whether spatial properties themselves represent a fundamental organizing principles in the ventral pathway.
  * Retinal size of objects has sig effect on fMRI response in ventral pathway.
      * Variance in spatial properties of images can explain patterns of response and that the influence of spatial properties was still evident when only between-category comparisons were analysed.
  * The importance of spatial properties on the topographic patterns of response varied systematically across ventral pathway.

Their task was to press a button whenever a red dot appeared on an image (same as 1 of the 3 tasks from the Kay et al. study).

They suggest that we know what category objects are based on low-level image properties, but obviously low-level properties are not the most important defining factor in an object belonging to a category, right? So there must be a way to showcase specific activity based on higher-level properties.

So now for the fun part. How can we combine the Watson et al. findings with the Kay et al. findings in order to come up with a novel research question? Let's take two of their bullet points:
* Attention induces larger pRFs that are also more spatially specific (Kay et al.)
* Distinct neural patterns to different object categories

<i> Buzz, whirl, clank ... </i>
### Can different task-demands induce differential category-selectivity decoding, despite same stimuli presentation?

For instance, if attention is not specific to high-level information, perhaps category-selectivity will depend more on low-level image statistics. In fact, Watson et al. found that low-level information may more accurately be the root cause of category-selectivity. However, what if the task involves the category of the stimulus? What if the task depended on different attributes of category (e.g., is it natural or artificial vs. is it the same subcategory might lead to a difference).

Do spatial properties represent a fundamental organizing principle of the ventral pathway, or do spatial properties modify the underlying categorical organization?
Well this study could look at how activation in LOC reflects larger pRFs and thereby more specialized activity if top-down demands are relevant to category.

High-level impacts: Making claims about category specificity strongly depends on the task used to study it. Decoding may be biased by top-down attention. We <i> learn </i> what things constitute a category not just via low-level image statistics but also from learned associations when category information is relevant to our demands.

See how differences in low-level image computation in ventral pathway may arise from how they process information differently dependent on the task.

Essentially a way to look at how low-level information may be more or less deprioritized in the ventral pathway dependent on attentional task.

How specific are pRFs for each task, how much does low-level info explain patterns of response for each task. Each task being attention to dot, one-back, or category selection. Intermixed tasks maybe?

methods
MVPA
pRFs mapping (w CSS)
GIST

First behavioral? ... eh

## Supplementary Step: Organizing Previously Read Articles
