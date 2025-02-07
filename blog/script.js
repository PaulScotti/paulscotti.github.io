const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

// Check for saved theme preference
let currentTheme = localStorage.getItem('theme');

if (currentTheme) {
    body.classList.add(currentTheme);
    if (currentTheme === 'light-mode') {
        themeToggle.textContent = "Dark";
    }
} else {
    // Default to dark mode
    currentTheme = 'dark-mode';
    body.classList.add(currentTheme);
    themeToggle.textContent = "Light";
}

themeToggle.addEventListener('click', () => {
    if (currentTheme === 'dark-mode') {
        body.classList.replace('dark-mode', 'light-mode');
        currentTheme = 'light-mode';
        themeToggle.textContent = "Dark";
    } else {
        body.classList.replace('light-mode', 'dark-mode');
        currentTheme = 'dark-mode';
        themeToggle.textContent = "Light";
    }

    // Save the current theme preference
    localStorage.setItem('theme', currentTheme);
});

// JavaScript for more interactive popups
document.addEventListener('DOMContentLoaded', () => {
    const popupLinks = document.querySelectorAll('.popup-link');
    let activePopup = null; // Keep track of the *currently* open popup

    popupLinks.forEach(link => {
        const popupContent = link.querySelector('.popup-content');
        let isHovered = false; // Track hover state *per popup*
        let isClickOpened = false; // Track click-open state *per popup*

        // Function to show the popup
        function showPopup() {
            popupContent.style.display = 'block';

            // Calculate position and adjust for screen edges
            let left = link.offsetLeft;
            let top = link.offsetTop + link.offsetHeight;

            // Get popup width *after* displaying it (otherwise it's 0)
            const popupWidth = popupContent.offsetWidth;
            const popupHeight = popupContent.offsetHeight;

            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;


            // Adjust left position if popup goes off-screen to the right
            if (left + popupWidth > viewportWidth) {
                left = viewportWidth - popupWidth - 20; // 20px margin from the edge
            }
             // Adjust left to prevent going off-screen to the left
            if (left < 0) {
                left = 0;
            }

            //Adjust top position if popup goes off-screen to the bottom
            if (top + popupHeight > viewportHeight) {
               top = link.offsetTop - popupHeight;
            }

             //Adjust bottom position if popup goes off-screen to the top. Very unlikely, but good to check.
            if(top < 0){
               top = 0;
            }


            popupContent.style.top = `${top}px`;
            popupContent.style.left = `${left}px`;
            activePopup = popupContent; // Update the *currently* active popup

        }

        // Function to hide the popup
        function hidePopup() {
            if (activePopup === popupContent) { // Only clear if *this* popup is active
                activePopup = null;
            }
            popupContent.style.display = 'none';
            isClickOpened = false; // Reset click-open state when hiding
        }

        // Mouseenter event (hover)
        link.addEventListener('mouseenter', () => {
            isHovered = true;
            if (!isClickOpened) { // Only show on hover if NOT click-opened
                if (activePopup && activePopup !== popupContent) {
                   hidePopup(); // Close any other open popup
                }
                showPopup();
            }
        });

        // Mouseleave event (hover)
        link.addEventListener('mouseleave', (event) => {
            isHovered = false;
            if (!isClickOpened && !link.contains(event.relatedTarget)) {
                // Hide only if NOT click-opened AND not going into children
                hidePopup();
            }
        });

        // Click event
        link.addEventListener('click', (event) => {
            if (!event.target.closest('.popup-content')) { // Click on outer link
                event.preventDefault();

                if (popupContent.style.display === 'block' && isClickOpened) {
                    // If already open *and* click-opened, close it
                    hidePopup();
                }  else {
                    // Otherwise, open (or re-open) and set click-opened
                    if(activePopup){
                        hidePopup();
                    }
                    showPopup();
                    isClickOpened = true; // Mark as click-opened
                }
            }
        });
    });

    // Close popups on click outside
   document.addEventListener('click', (event) => {
        if (activePopup && !event.target.closest('.popup-link')) {
            // Check if click target is inside an element with class 'popup-link'
            hidePopup(); // Close the active popup
        }
    });
});
// TOC Layout Logic
const sidebarToc = document.getElementById('sidebar-toc');
const inlineToc = document.getElementById('inline-toc');

function adjustLayout() {
    if (window.innerWidth <= 1400) {
        inlineToc.style.display = 'block';
        sidebarToc.style.display = 'none';
    } else {
        inlineToc.style.display = 'none';
        sidebarToc.style.display = 'block';
    }
}

// Call on load and resize
window.addEventListener('load', adjustLayout);
window.addEventListener('resize', adjustLayout);

// Add mailing list div
document.addEventListener("DOMContentLoaded", function () {
    const mailingListHTML = `
        <div class="mailing_list">
            <hr>
            <p><a href="https://groups.google.com/g/neuneuro">Click here to join my email list</a> to get new posts and updates to your inbox.<br>
                (Or send an empty email to <a href="mailto:neuneuro+subscribe@googlegroups.com">neuneuro+subscribe@googlegroups.com</a>.)
            </p>
        </div>
    `;

    // Append it to a specific container
    const targetContainer = document.getElementById("mailingListContainer");
    if (targetContainer) {
        targetContainer.innerHTML = mailingListHTML;
    } else {
        console.error("Target container not found!");
    }
});

// Scrollspy Functionality for Sidebar TOC
document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('#content h1, #content h2');
    const tocLinks = document.querySelectorAll('#sidebar-toc ul li a');

    function highlightActiveLink() {
        let currentSectionId = null;
        let viewportHeight = window.innerHeight;
        let scrollY = window.scrollY;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            if (scrollY >= sectionTop - viewportHeight / 3) {
                currentSectionId = section.getAttribute('id');
            }
        });

        tocLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${currentSectionId}`) {
                link.classList.add('active');
            }
        });
    }

    if (tocLinks.length > 0 && sections.length > 0) {
        tocLinks[0].classList.add('active');
    }

    window.addEventListener('scroll', highlightActiveLink);
    highlightActiveLink();
});