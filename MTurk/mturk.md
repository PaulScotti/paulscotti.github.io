<script src="https://ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js"></script>

<style>
.trialDiv {
	border: 2px solid gray;
	padding: 20px;
	width: 200px;
	margin: 0 auto;
	font-family: Arial, Helvetica;
	font-size: 14pt;
	display: none;
}
</style>

<p>Judge whether this object is bigger or smaller than a <b>shoebox</b>.</p>

<div id="trial1" class="trialDiv">
<p><img src="http://timbrady.org/turk/images/lock.jpg" width="100"></p>
<p><input type="radio" class="responseButton" name="question1" value="-1"> smaller</p>
<p><input type="radio" class="responseButton" name="question1" value="1"> bigger</p>
</div>

<div id="trial2" class='trialDiv'>
<p><img src="http://timbrady.org/turk/images/car.jpg" width="100"></p>
<p><input type="radio" class="responseButton" name="question2" value="-1"> smaller</p>
<p><input type="radio" class="responseButton" name="question2" value="1"> bigger</p>
</div>

<script>
var curTrial = 1;
var nTrials = 4;
function buttonClicked() {
	alert('clicked');
}

$('.responseButton').click(buttonClicked);
</script>