function bandwidth_test(){
  // Let's initialize the primitives
  var startedTime, endTime, fileSize;

  // Set up the AJAX to perform
  var xhr = new XMLHttpRequest();

  // Rig the call-back... THE important part
  xhr.onreadystatechange = function () {

    // we only need to know when the request has completed
    if (xhr.readyState === 4 && xhr.status === 200) {

      // Here we stop the timer & register end time
      endTime = (new Date()).getTime();

      // Also, calculate the file-size which has transferred
      fileSize = xhr.responseText.length;

      // Calculate band_speed as global variable; the connection-speed in kbps
      band_speed = (fileSize * 8) / ((endTime - startedTime)/1000) / 1024;

    }
  }

  // Snap back; here's where we start the timer
  startedTime = (new Date()).getTime();

  // All set, let's hit it!
  xhr.open("GET", "https://paulscotti.github.io/mturk/InterGroup_Spatial_files/ringFlip.png", true);
  xhr.send();
}
