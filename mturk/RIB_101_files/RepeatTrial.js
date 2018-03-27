  var temp = currentTrial;
  img.src = $('#' + dx.testimg[0])[0].src; 
  for (k=0;k<2;k++) { 
      currentTrial = -999;
      console.log('help');
      img.src = $('#' + dx.testimg[0])[0].src; 
      SetTri(dx.testimg[0], 250, ctx, 200, 200);
      $('#allItems').css('margin-top', -1000);
      $('#showTrial').show();
      $('#pressKey').show();
      setTimeout(function() {      
        $('#allItems').css('margin-top', 0);
        setTimeout(function() { 
            $('#allItems').css('margin-top', -1000);
            setTimeout(function() {
              $('#showTrial').hide();
            }, isiTime);
        }, displayTime);
      }, 500);
      $('#pressKey').hide();
  }