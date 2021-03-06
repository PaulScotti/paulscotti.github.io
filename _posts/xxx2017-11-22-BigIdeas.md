---
layout: post
title:  "Big Ideas"
date:   2017-11-22
excerpt: "Some goals I hope to achieve in the future."
comments: false
---

# How do memories influence other memories?

## A real-world example
You are an airport security checkpoint screener. Every day you see hundreds of people fly in hoping to gain access to their international destination. One day, at the end of a long shift, your boss calls you to his office. Apparently, a suspected terrorist under a false identity has been let into the country and your boss needs to know:

1) Was it you who let in the terrorist (i.e., familiarity)
2) What were they wearing, so that police can better search for them (i.e., recollection)

Unfortunately, it is difficult to answer these questions considering you have to comb your memory for the hundreds of passengers you saw that day.
In addition, it may be the case that these memories for today's passengers have mixed together in your mind. This may lead to inaccurate reports.

## Constructing a model for long-term memory
To simplify, let us replace the hundreds of passengers with hundreds of real-world objects (e.g., suitcase, hat, bus). Let us also assume that all of these objects consist of a single color. This way we can more measure memory fidelity according to accuracy on continuous color reports.

Each subject in this study witnesses, one at a time, 408 objects. They are told to pay special attention to the color of every object for a later memory test. They also perform a repeat detection task during learning to make sure they are paying attention.

Unknown to them is that 50% of objects appear from a certain range of colors (a randomly selected 90 degrees of color space, e.g. 50% of objects are blueish or purpleish). The rest of the objects are randomly colored from the remainder of color wheel space.

At the end of 408 trials of learning, they are asked to select the original color for each object on a color wheel (objects are presented in black and white).  

We can model their performance according to 3 von Mises distributions:
1) Uniform distribution (guessing rate, this is akin to familiarity: if you don't recognize the object then you will guess randomly on the color wheel)
  * One question is whether a biased guessing rate (see parameter) would eliminate the need for a uniform distribution parameter.
2) Gaussian distribution centered on the true color of the objects
  * Compare model fit using Gaussian distribution on the true 90 degree bias versus 90 degree biases for the other quadrants of the color wheel.
3) Gaussian distribution across the biased color space (biased memory distribution)
  * To calculate this, we essentially need to create a joint probability of 90 Gaussians along the biased 90 degrees of color space.
  * But how should we define these 90 Gaussians -- what would their standard deviation be for instance? Should this just be a free parameter to be fit using maximum likelihood estimation, aka a single added parameter that is shared among the 90 Gaussians?
  * We are assuming that the bias is distributed as a result of shared storage (or some sort of strategy), and not a bias in encoding. If we thought it was encoding, though, we might be able to use a Kalman filter to account for accumulation of learned contingencies across parameter 3.

<b>We are trying to see how a bias taints our memory representations.</b>

Preliminary results indicate that all subjects are more likely to report colors towards the biased 90 degrees for objects that were originally not within that segment of the color wheel.

In other words, if you learn 200 green objects, you are more likely to report an originally red object as greener.

<b>How pervasive is this bias?</b>
In our second experiment, halfway through learning objects, the 90 degree bias was shifted to the opposite end of the color wheel. We predicted three possible outcomes:

1) Objects from the 2nd half of the study onward would now be biased towards the new biased segment of the color wheel.
2) Objects from the 2nd half of the study onward would continue to be biased by the first half's biased quadrant.
3) Because the bias encompassed opposite ends of the color wheel, biases towards one end or the other will be counteracted and there will not be any observed systematic bias for any of the objects.

Results suggest that number 2 is the case. Objects from the 2nd half of the study were still biased towards the original 90 degrees. Every subject demonstrated this trend, including subjects who did not showcase any implicit or explicit knowledge of color probability manipulations.

This suggests that once a bias has been cemented, it is difficult to rid oneself of that bias.

<b>Can biases be temporally constrained if given an external cue?</b>

Our next experiment, to be conducted...
