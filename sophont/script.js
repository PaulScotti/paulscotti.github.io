document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    const navLinks = document.querySelectorAll('nav a, .footer-col a');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            // Only process anchor links
            if (href.startsWith('#')) {
                e.preventDefault();
                const targetId = href.substring(1);
                const targetElement = document.getElementById(targetId);
                
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 80,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Create advanced multimodal visualization with drag and drop support
    const heroVisual = document.querySelector('.hero-visual');
    const modelVisualization = document.querySelector('.model-visualization');
    const infoPanel = document.getElementById('model-info-panel');
    
    if (heroVisual && modelVisualization) {
        // Clear existing content and preserve the info panel and chalkboard
        const existingElements = Array.from(modelVisualization.children);
        const chalkboard = existingElements.find(el => el.classList.contains('chalkboard-overlay'));
        const infoPanelEl = existingElements.find(el => el.classList.contains('model-info-panel'));
        
        // Remove all other elements
        existingElements.forEach(el => {
            if (!el.classList.contains('chalkboard-overlay') && !el.classList.contains('model-info-panel')) {
                el.remove();
            }
        });
        
        // Add SVG container
        const svgContainer = document.createElement('div');
        svgContainer.className = 'svg-container';
        modelVisualization.insertBefore(svgContainer, chalkboard);
        
        // Create dynamic SVG
        const svgNS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('viewBox', '0 0 1600 900');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
        svgContainer.appendChild(svg);
        
        // Create central node (latent space)
        const centralNode = document.createElementNS(svgNS, 'g');
        centralNode.setAttribute('class', 'central-node');
        centralNode.setAttribute('transform', 'translate(800, 450)');
        
        // Define gradients and filters
        const defs = document.createElementNS(svgNS, 'defs');
        defs.innerHTML = `
            <radialGradient id="centralGradient" cx="50%" cy="50%" r="60%" fx="40%" fy="40%">
                <stop offset="0%" stop-color="#48cae4" stop-opacity="1" />
                <stop offset="70%" stop-color="#0096c7" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#023e8a" stop-opacity="0.7" />
            </radialGradient>
            
            <radialGradient id="neuroimagingGradient" cx="50%" cy="50%" r="60%" fx="40%" fy="40%">
                <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#0077ff" stop-opacity="0.7" />
            </radialGradient>
            
            <radialGradient id="clinicalNLPGradient" cx="50%" cy="50%" r="60%" fx="40%" fy="40%">
                <stop offset="0%" stop-color="#9d4edd" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#6a0dad" stop-opacity="0.7" />
            </radialGradient>
            
            <radialGradient id="pathologyGradient" cx="50%" cy="50%" r="60%" fx="40%" fy="40%">
                <stop offset="0%" stop-color="#ef476f" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#d90429" stop-opacity="0.7" />
            </radialGradient>
            
            <linearGradient id="neuroimagingPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#00d4ff" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#48cae4" stop-opacity="0.6" />
            </linearGradient>
            
            <linearGradient id="clinicalNLPPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#9d4edd" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#48cae4" stop-opacity="0.6" />
            </linearGradient>
            
            <linearGradient id="pathologyPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#ef476f" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#48cae4" stop-opacity="0.6" />
            </linearGradient>
            
            <filter id="glow">
                <feGaussianBlur stdDeviation="8" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
            
            <filter id="brainScanTexture">
                <feTurbulence type="fractalNoise" baseFrequency="0.15" numOctaves="2" result="noise" seed="1"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
                <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.5 0"/>
            </filter>
            
            <filter id="ehrTexture">
                <feTurbulence type="fractalNoise" baseFrequency="0.35" numOctaves="1" result="noise" seed="2"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            
            <filter id="histoTexture">
                <feTurbulence type="fractalNoise" baseFrequency="0.2" numOctaves="3" result="noise" seed="3"/>
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" />
                <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0.7 0"/>
            </filter>
            
            <symbol id="brain-icon" viewBox="0 0 24 24">
                <path d="M13.84,10.09a1.21,1.21,0,0,0-1.17-.16,1.17,1.17,0,0,0-.7.95,4.13,4.13,0,0,0,1.13,3,6.66,6.66,0,0,0,3,1.47,1.2,1.2,0,0,0,1.17-.17,1.18,1.18,0,0,0,.7-.95,4.13,4.13,0,0,0-1.13-3A6.7,6.7,0,0,0,13.84,10.09ZM8.9,13.9A4.13,4.13,0,0,0,7.77,10.9,1.19,1.19,0,0,0,7.07,10,1.19,1.19,0,0,0,5.9,10.1a6.63,6.63,0,0,0-3,1.47,4.12,4.12,0,0,0-1.13,3,1.19,1.19,0,0,0,.7.95,1.19,1.19,0,0,0,1.17.16A6.65,6.65,0,0,0,8.9,13.9Zm15.42-2.29a1.37,1.37,0,0,0-1.31-.15,8,8,0,0,0-2.92,1.4A7.59,7.59,0,0,1,20,15a7.37,7.37,0,0,1-.11,1.8,2.13,2.13,0,0,0,.73.34,1.42,1.42,0,0,0,1.31-.15,3.9,3.9,0,0,0,1.61-2.87A3.63,3.63,0,0,0,24.32,11.61ZM5.34,18.8a2.13,2.13,0,0,0,.73-.34A7.37,7.37,0,0,1,6,15a7.59,7.59,0,0,1-.09-2.13,8,8,0,0,0-2.92-1.4,1.27,1.27,0,0,0-1.31.15A4.06,4.06,0,0,0,.1,14.21a4,4,0,0,0,1.6,2.91A1.27,1.27,0,0,0,3,17.28,2.13,2.13,0,0,0,4,16.94a.72.72,0,0,1,.73-.34A7.37,7.37,0,0,1,6,15C5.93,16.27,5.34,18.8,5.34,18.8ZM17.82,5.4a5.81,5.81,0,0,1,1.89,4.22,5.41,5.41,0,0,1-1,2.77c-1,1.4-1,1.47-1.31,3.22a4.19,4.19,0,0,0,0,1.46c.2.86.92,1.2,1.55.73s2-2.89,2.43-3.88,1.17-2.95.79-5.15S21,4.54,19.88,3A10.85,10.85,0,0,0,13.19,0h0A10.85,10.85,0,0,0,6.5,3c-1.14,1.5-1.8,3-.82,4.84s1.69,5.12,3.26,6.37.91-.06,1.55-.73A4.19,4.19,0,0,0,11,12,6.16,6.16,0,0,1,9.67,8.75,5.81,5.81,0,0,1,11.56,4.5a7.2,7.2,0,0,1,3.22-2.17h0A7.2,7.2,0,0,1,17.82,5.4Z"/>
            </symbol>
            
            <symbol id="clinical-nlp-icon" viewBox="0 0 24 24">
                <path d="M19,2H5A3,3,0,0,0,2,5V19a3,3,0,0,0,3,3H19a3,3,0,0,0,3-3V5A3,3,0,0,0,19,2ZM12,18a1,1,0,1,1,1-1A1,1,0,0,1,12,18Zm7-6H9.41l2.3-2.29a1,1,0,1,0-1.42-1.42l-4,4a1,1,0,0,0-.21.33,1,1,0,0,0,0,.76,1,1,0,0,0,.21.33l4,4a1,1,0,0,0,1.42,0,1,1,0,0,0,0-1.42L9.41,14H19a1,1,0,0,0,0-2ZM10,8h3a1,1,0,0,0,0-2H10a1,1,0,0,0,0,2Z"/>
            </symbol>
            
            <symbol id="pathology-icon" viewBox="0 0 24 24">
                <path d="M19.74,7.88A2.93,2.93,0,0,0,19,5.5a1,1,0,0,0,0-.15,3,3,0,0,0-5.82-1,3,3,0,0,0-2.36,0,3,3,0,0,0-5.82,1,1,1,0,0,0,0,.15,2.93,2.93,0,0,0-.74,2.38A3,3,0,0,0,5.5,12.5a3,3,0,0,0-1.24,4.62A3,3,0,0,0,8,21a2.93,2.93,0,0,0,1.88-.69,3,3,0,0,0,4.24,0A2.93,2.93,0,0,0,16,21a3,3,0,0,0,3.74-3.88A3,3,0,0,0,18.5,12.5,3,3,0,0,0,19.74,7.88ZM8,19a1,1,0,1,1,1-1A1,1,0,0,1,8,19Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,8,15Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,8,11Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,8,7ZM12,18a1,1,0,1,1,1-1A1,1,0,0,1,12,18Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,12,14Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,12,10Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,12,6ZM16,19a1,1,0,1,1,1-1A1,1,0,0,1,16,19Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,16,15Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,16,11Zm0-4a1,1,0,1,1,1-1A1,1,0,0,1,16,7Z"/>
            </symbol>
            
            <symbol id="computer-icon" viewBox="0 0 24 24">
                <path d="M19,3H5A3,3,0,0,0,2,6v8a3,3,0,0,0,3,3h6v2H7a1,1,0,0,0,0,2H17a1,1,0,0,0,0-2H13V17h6a3,3,0,0,0,3-3V6A3,3,0,0,0,19,3Zm1,11a1,1,0,0,1-1,1H5a1,1,0,0,1-1-1V6A1,1,0,0,1,5,5H19a1,1,0,0,1,1,1Z"/>
            </symbol>
            
            <pattern id="brain-pattern" viewBox="0 0 80 80" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="#00d4ff" opacity="0.2" />
                <circle cx="40" cy="40" r="30" fill="#0077ff" opacity="0.3" />
                <use href="#brain-icon" x="20" y="20" width="40" height="40" fill="white" opacity="0.6" />
            </pattern>
            
            <pattern id="clinical-nlp-pattern" viewBox="0 0 80 80" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="#9d4edd" opacity="0.2" />
                <rect x="10" y="10" width="60" height="60" rx="4" fill="#6a0dad" opacity="0.3" />
                <use href="#clinical-nlp-icon" x="20" y="20" width="40" height="40" fill="white" opacity="0.6" />
            </pattern>
            
            <pattern id="pathology-pattern" viewBox="0 0 80 80" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="#ef476f" opacity="0.2" />
                <circle cx="40" cy="40" r="30" fill="#d90429" opacity="0.3" />
                <use href="#pathology-icon" x="20" y="20" width="40" height="40" fill="white" opacity="0.6" />
            </pattern>
            
            <pattern id="computer-pattern" viewBox="0 0 80 80" width="80" height="80" patternUnits="userSpaceOnUse">
                <rect width="100%" height="100%" fill="#06d6a0" opacity="0.2" />
                <rect x="10" y="10" width="60" height="60" rx="4" fill="#058c7e" opacity="0.3" />
                <use href="#computer-icon" x="20" y="20" width="40" height="40" fill="white" opacity="0.6" />
            </pattern>
            
            <linearGradient id="computerPathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#48cae4" stop-opacity="0.6" />
                <stop offset="100%" stop-color="#06d6a0" stop-opacity="0.6" />
            </linearGradient>
            
            <radialGradient id="computerGradient" cx="50%" cy="50%" r="60%" fx="40%" fy="40%">
                <stop offset="0%" stop-color="#06d6a0" stop-opacity="0.9" />
                <stop offset="100%" stop-color="#058c7e" stop-opacity="0.7" />
            </radialGradient>
        `;
        
        svg.appendChild(defs);
        
        // Path container to ensure paths are below nodes
        const pathContainer = document.createElementNS(svgNS, 'g');
        pathContainer.setAttribute('class', 'path-container');
        svg.appendChild(pathContainer);
        
        // Create main latent space node
        const centralCircle = document.createElementNS(svgNS, 'circle');
        centralCircle.setAttribute('cx', '0');
        centralCircle.setAttribute('cy', '0');
        centralCircle.setAttribute('r', '100');
        centralCircle.setAttribute('fill', 'url(#centralGradient)');
        centralCircle.setAttribute('filter', 'url(#glow)');
        centralNode.appendChild(centralCircle);
        
        // Add central node text label
        const centralLabel = document.createElementNS(svgNS, 'text');
        centralLabel.setAttribute('x', '0');
        centralLabel.setAttribute('y', '0');
        centralLabel.setAttribute('text-anchor', 'middle');
        centralLabel.setAttribute('dominant-baseline', 'middle');
        centralLabel.setAttribute('fill', 'white');
        centralLabel.setAttribute('font-size', '24');
        centralLabel.setAttribute('font-weight', 'bold');
        centralLabel.textContent = 'Latent Space';
        centralNode.appendChild(centralLabel);
        
        // Create small floating particles within the central node
        for (let i = 0; i < 25; i++) {
            const particle = document.createElementNS(svgNS, 'circle');
            const randomRadius = 1 + Math.random() * 3;
            const randomAngle = Math.random() * Math.PI * 2;
            const randomDistance = Math.random() * 80;
            const x = Math.cos(randomAngle) * randomDistance;
            const y = Math.sin(randomAngle) * randomDistance;
            
            particle.setAttribute('cx', x);
            particle.setAttribute('cy', y);
            particle.setAttribute('r', randomRadius);
            
            // Randomly assign colors from the data nodes
            const colors = ['#00d4ff', '#9d4edd', '#ef476f'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            particle.setAttribute('fill', randomColor);
            particle.setAttribute('opacity', 0.5 + Math.random() * 0.5);
            
            // Random animation of each particle
            const animate1 = document.createElementNS(svgNS, 'animate');
            animate1.setAttribute('attributeName', 'cx');
            animate1.setAttribute('from', x);
            animate1.setAttribute('to', x + (Math.random() * 40 - 20));
            animate1.setAttribute('dur', 3 + Math.random() * 5 + 's');
            animate1.setAttribute('repeatCount', 'indefinite');
            animate1.setAttribute('calcMode', 'spline');
            animate1.setAttribute('keySplines', '0.5 0 0.5 1; 0.5 0 0.5 1');
            
            const animate2 = document.createElementNS(svgNS, 'animate');
            animate2.setAttribute('attributeName', 'cy');
            animate2.setAttribute('from', y);
            animate2.setAttribute('to', y + (Math.random() * 40 - 20));
            animate2.setAttribute('dur', 3 + Math.random() * 5 + 's');
            animate2.setAttribute('repeatCount', 'indefinite');
            animate2.setAttribute('calcMode', 'spline');
            animate2.setAttribute('keySplines', '0.5 0 0.5 1; 0.5 0 0.5 1');
            
            particle.appendChild(animate1);
            particle.appendChild(animate2);
            centralNode.appendChild(particle);
        }
        
        // Create central node pulses
        for (let i = 0; i < 3; i++) {
            const pulse = document.createElementNS(svgNS, 'circle');
            pulse.setAttribute('cx', '0');
            pulse.setAttribute('cy', '0');
            pulse.setAttribute('r', '100');
            pulse.setAttribute('fill', 'none');
            pulse.setAttribute('stroke', '#48cae4');
            pulse.setAttribute('stroke-width', '3');
            pulse.setAttribute('class', 'pulse');
            
            const animate = document.createElementNS(svgNS, 'animate');
            animate.setAttribute('attributeName', 'r');
            animate.setAttribute('from', '100');
            animate.setAttribute('to', '200');
            animate.setAttribute('dur', '4s');
            animate.setAttribute('begin', `${i * 1.3}s`);
            animate.setAttribute('repeatCount', 'indefinite');
            
            const animateOpacity = document.createElementNS(svgNS, 'animate');
            animateOpacity.setAttribute('attributeName', 'opacity');
            animateOpacity.setAttribute('from', '0.8');
            animateOpacity.setAttribute('to', '0');
            animateOpacity.setAttribute('dur', '4s');
            animateOpacity.setAttribute('begin', `${i * 1.3}s`);
            animateOpacity.setAttribute('repeatCount', 'indefinite');
            
            pulse.appendChild(animate);
            pulse.appendChild(animateOpacity);
            centralNode.appendChild(pulse);
        }
        
        svg.appendChild(centralNode);
        
        // Data nodes representing different medical inputs
        const dataNodes = [
            { 
                id: 'neuroimaging',
                label: 'Neuroimaging',
                x: 300, 
                y: 250, 
                r: 80, 
                gradient: 'neuroimagingGradient', 
                pathGradient: 'neuroimagingPathGradient',
                pattern: 'brain-pattern',
                filter: 'brainScanTexture',
                description: 'Brain scans including MRI, fMRI, CT and PET imaging that capture neural structure and activity.',
                dataType: 'scan'
            },
            { 
                id: 'clinical-nlp', 
                label: 'Clinical NLP', 
                x: 300, 
                y: 650, 
                r: 80, 
                gradient: 'clinicalNLPGradient', 
                pathGradient: 'clinicalNLPPathGradient',
                pattern: 'clinical-nlp-pattern',
                filter: 'ehrTexture',
                description: 'Electronic health records, clinical notes, lab results, and patient history processed through natural language processing.',
                dataType: 'document'
            },
            { 
                id: 'pathology', 
                label: 'Pathology', 
                x: 1300, 
                y: 450, 
                r: 80, 
                gradient: 'pathologyGradient', 
                pathGradient: 'pathologyPathGradient',
                pattern: 'pathology-pattern',
                filter: 'histoTexture',
                description: 'Gigapixel histopathology scans revealing tissue structure and cellular patterns at microscopic levels.',
                dataType: 'scan'
            }
        ];
        
        // Applications node
        const applicationsNode = { 
            id: 'applications', 
            label: 'Applications', 
            x: 1300, 
            y: 200, 
            r: 80, 
            gradient: 'computerGradient', 
            pathGradient: 'computerPathGradient',
            pattern: 'computer-pattern',
            filter: '',
            description: 'Downstream applications using unified medical representations including AI assistants, clinical note summarization, patient-facing chatbots, and novel diagnostic tools.',
            dataType: 'computer'
        };
        
        // Draw connection paths
        const updatePaths = () => {
            // Remove all existing paths
            while (pathContainer.firstChild) {
                pathContainer.removeChild(pathContainer.firstChild);
            }
            
            // Create new paths from data nodes to latent space
            dataNodes.forEach((node, index) => {
                // Create data flow path
                const path = document.createElementNS(svgNS, 'path');
                const pathId = `dataPath${index}`;
                path.setAttribute('id', pathId);
                
                // Calculate control point to make curved path
                const dx = 800 - node.x;
                const dy = 450 - node.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const midX = (node.x + 800) / 2;
                const midY = (node.y + 450) / 2;
                
                // Add some perpendicular offset for the curve
                const perpX = -dy / distance * 100;
                const perpY = dx / distance * 100;
                
                path.setAttribute('d', `M${node.x},${node.y} Q${midX + perpX},${midY + perpY} 800,450`);
                path.setAttribute('stroke', `url(#${node.pathGradient})`);
                path.setAttribute('stroke-width', '4');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke-dasharray', '10,10');
                path.setAttribute('class', 'data-path');
                pathContainer.appendChild(path);
                
                // Create animated data particles flowing along the path
                for (let i = 0; i < 5; i++) {
                    const dataParticle = document.createElementNS(svgNS, 'g');
                    dataParticle.setAttribute('class', 'data-particle');
                    
                    let particle;
                    
                    if (node.dataType === 'scan') {
                        // For scan-type data (brain scans, histopathology)
                        particle = document.createElementNS(svgNS, 'rect');
                        particle.setAttribute('width', '20');
                        particle.setAttribute('height', '20');
                        particle.setAttribute('x', '-10');
                        particle.setAttribute('y', '-10');
                        particle.setAttribute('rx', '2');
                        particle.setAttribute('fill', `url(#${node.pattern})`);
                        particle.setAttribute('filter', `url(#${node.filter})`);
                    } else {
                        // For document-type data (EHR, clinical notes)
                        particle = document.createElementNS(svgNS, 'rect');
                        particle.setAttribute('width', '16');
                        particle.setAttribute('height', '20');
                        particle.setAttribute('x', '-8');
                        particle.setAttribute('y', '-10');
                        particle.setAttribute('rx', '2');
                        particle.setAttribute('fill', `url(#${node.pattern})`);
                        particle.setAttribute('filter', `url(#${node.filter})`);
                    }
                    
                    dataParticle.appendChild(particle);
                    
                    // Create animation along the path
                    const animateMotion = document.createElementNS(svgNS, 'animateMotion');
                    animateMotion.setAttribute('dur', `${3 + i * 0.7}s`);
                    animateMotion.setAttribute('repeatCount', 'indefinite');
                    animateMotion.setAttribute('path', `M${node.x},${node.y} Q${midX + perpX},${midY + perpY} 800,450`);
                    animateMotion.setAttribute('begin', `${i * 0.8}s`);
                    animateMotion.setAttribute('calcMode', 'spline');
                    animateMotion.setAttribute('keySplines', '0.4 0 0.6 1');
                    
                    dataParticle.appendChild(animateMotion);
                    pathContainer.appendChild(dataParticle);
                }
            });
            
            // Create path from latent space to applications node
            if (applicationsNode) {
                const path = document.createElementNS(svgNS, 'path');
                path.setAttribute('id', 'applicationsPath');
                
                // Calculate control point to make curved path
                const dx = applicationsNode.x - 800;
                const dy = applicationsNode.y - 450;
                const distance = Math.sqrt(dx * dx + dy * dy);
                const midX = (applicationsNode.x + 800) / 2;
                const midY = (applicationsNode.y + 450) / 2;
                
                // Add some perpendicular offset for the curve
                const perpX = -dy / distance * 100;
                const perpY = dx / distance * 100;
                
                path.setAttribute('d', `M800,450 Q${midX + perpX},${midY + perpY} ${applicationsNode.x},${applicationsNode.y}`);
                path.setAttribute('stroke', `url(#${applicationsNode.pathGradient})`);
                path.setAttribute('stroke-width', '4');
                path.setAttribute('fill', 'none');
                path.setAttribute('stroke-dasharray', '10,10');
                path.setAttribute('class', 'data-path');
                pathContainer.appendChild(path);
                
                // Create animated data particles flowing along the path
                for (let i = 0; i < 5; i++) {
                    const dataParticle = document.createElementNS(svgNS, 'g');
                    dataParticle.setAttribute('class', 'data-particle');
                    
                    // For computer node
                    const particle = document.createElementNS(svgNS, 'rect');
                    particle.setAttribute('width', '18');
                    particle.setAttribute('height', '18');
                    particle.setAttribute('x', '-9');
                    particle.setAttribute('y', '-9');
                    particle.setAttribute('rx', '3');
                    particle.setAttribute('fill', `url(#${applicationsNode.pattern})`);
                    
                    dataParticle.appendChild(particle);
                    
                    // Create animation along the path
                    const animateMotion = document.createElementNS(svgNS, 'animateMotion');
                    animateMotion.setAttribute('dur', `${3 + i * 0.7}s`);
                    animateMotion.setAttribute('repeatCount', 'indefinite');
                    animateMotion.setAttribute('path', `M800,450 Q${midX + perpX},${midY + perpY} ${applicationsNode.x},${applicationsNode.y}`);
                    animateMotion.setAttribute('begin', `${i * 0.8}s`);
                    animateMotion.setAttribute('calcMode', 'spline');
                    animateMotion.setAttribute('keySplines', '0.4 0 0.6 1');
                    
                    dataParticle.appendChild(animateMotion);
                    pathContainer.appendChild(dataParticle);
                }
            }
        };
        
        // Function to create a node and make it draggable
        const createNode = (node, index, isDataNode = true) => {
            const nodeGroup = document.createElementNS(svgNS, 'g');
            nodeGroup.setAttribute('class', 'draggable-node');
            nodeGroup.setAttribute('id', node.id);
            nodeGroup.setAttribute('transform', `translate(${node.x}, ${node.y})`);
            if (isDataNode) {
                nodeGroup.setAttribute('data-index', index);
            } else {
                nodeGroup.setAttribute('data-app-node', 'true');
            }
            
            // Create node circle
            const nodeCircle = document.createElementNS(svgNS, 'circle');
            nodeCircle.setAttribute('cx', '0');
            nodeCircle.setAttribute('cy', '0');
            nodeCircle.setAttribute('r', node.r);
            nodeCircle.setAttribute('fill', `url(#${node.gradient})`);
            nodeCircle.setAttribute('filter', 'url(#glow)');
            nodeGroup.appendChild(nodeCircle);
            
            // Add icon to node center
            const nodeIcon = document.createElementNS(svgNS, 'use');
            nodeIcon.setAttribute('href', `#${node.id.replace(/\-/g, '-')}-icon`);
            nodeIcon.setAttribute('x', '-25');
            nodeIcon.setAttribute('y', '-25');
            nodeIcon.setAttribute('width', '50');
            nodeIcon.setAttribute('height', '50');
            nodeIcon.setAttribute('fill', 'white');
            nodeIcon.setAttribute('opacity', '0.8');
            nodeGroup.appendChild(nodeIcon);
            
            // Create label for node
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', '0');
            text.setAttribute('y', '0');
            text.setAttribute('dy', '40');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('fill', 'white');
            text.setAttribute('font-size', '20');
            text.setAttribute('font-weight', 'bold');
            text.textContent = node.label;
            nodeGroup.appendChild(text);
            
            // Create orbiting particles around node
            for (let i = 0; i < 5; i++) {
                const orbitRadius = node.r + 10;
                const particle = document.createElementNS(svgNS, 'circle');
                particle.setAttribute('r', '4');
                particle.setAttribute('fill', 'white');
                particle.setAttribute('opacity', '0.7');
                
                // Create animation along circular path
                const animateMotion = document.createElementNS(svgNS, 'animateMotion');
                const orbitSpeed = 15 + Math.random() * 10;
                animateMotion.setAttribute('dur', `${orbitSpeed}s`);
                animateMotion.setAttribute('repeatCount', 'indefinite');
                animateMotion.setAttribute('path', `M${orbitRadius},0 a${orbitRadius},${orbitRadius} 0 1,0 -${orbitRadius * 2},0 a${orbitRadius},${orbitRadius} 0 1,0 ${orbitRadius * 2},0`);
                animateMotion.setAttribute('begin', `${i * 0.2 * orbitSpeed}s`);
                
                particle.appendChild(animateMotion);
                nodeGroup.appendChild(particle);
            }
            
            // Make nodes draggable with both mouse and touch support
            let isDragging = false;
            let startX, startY, nodeX, nodeY;
            
            // Helper function to get node info
            const showNodeInfo = (element) => {
                if (infoPanel) {
                    let nodeInfo;
                    if (element.hasAttribute('data-index')) {
                        const index = parseInt(element.getAttribute('data-index'));
                        nodeInfo = dataNodes[index];
                    } else if (element.hasAttribute('data-app-node')) {
                        nodeInfo = applicationsNode;
                    }
                    
                    if (nodeInfo) {
                        infoPanel.innerHTML = `
                            <h4>${nodeInfo.label}</h4>
                            <p>${nodeInfo.description}</p>
                        `;
                        infoPanel.classList.add('visible');
                    }
                }
            };
            
            // Helper function to update node position
            const updateNodePosition = (element, newX, newY) => {
                if (element.hasAttribute('data-index')) {
                    const index = parseInt(element.getAttribute('data-index'));
                    element.setAttribute('transform', `translate(${newX}, ${newY})`);
                    dataNodes[index].x = newX;
                    dataNodes[index].y = newY;
                } else if (element.hasAttribute('data-app-node')) {
                    element.setAttribute('transform', `translate(${newX}, ${newY})`);
                    applicationsNode.x = newX;
                    applicationsNode.y = newY;
                }
                
                // Update paths
                updatePaths();
            };
            
            // Mouse events
            nodeGroup.addEventListener('mousedown', function(e) {
                e.preventDefault();
                
                // Get current transform position
                const transform = this.getAttribute('transform');
                const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                if (match) {
                    nodeX = parseFloat(match[1]);
                    nodeY = parseFloat(match[2]);
                    
                    startX = e.clientX;
                    startY = e.clientY;
                    isDragging = true;
                    
                    // Show info panel with node description
                    showNodeInfo(this);
                    
                    // Add grabbing cursor to document during drag
                    document.body.style.cursor = 'grabbing';
                    this.style.cursor = 'grabbing';
                }
            });
            
            // Touch events
            nodeGroup.addEventListener('touchstart', function(e) {
                // Prevent screen from scrolling when dragging nodes
                e.preventDefault();
                
                // Get current transform position
                const transform = this.getAttribute('transform');
                const match = transform.match(/translate\(([^,]+),([^)]+)\)/);
                if (match && e.touches && e.touches[0]) {
                    nodeX = parseFloat(match[1]);
                    nodeY = parseFloat(match[2]);
                    
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                    isDragging = true;
                    
                    // Show info panel with node description
                    showNodeInfo(this);
                }
            }, { passive: false }); // Important for preventing default on iOS
            
            // Mouse move
            document.addEventListener('mousemove', function(e) {
                if (!isDragging) return;
                
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                
                // Get svg viewport dimensions for scaling
                const svgRect = svg.getBoundingClientRect();
                const scaleX = 1600 / svgRect.width;
                const scaleY = 900 / svgRect.height;
                
                // Scale mouse movement to SVG coordinates
                const scaledDx = dx * scaleX;
                const scaledDy = dy * scaleY;
                
                const newX = nodeX + scaledDx;
                const newY = nodeY + scaledDy;
                
                // Update the dragged node position
                updateNodePosition(nodeGroup, newX, newY);
            });
            
            // Touch move
            document.addEventListener('touchmove', function(e) {
                if (!isDragging || !e.touches || !e.touches[0]) return;
                
                // Prevent default to stop scrolling
                e.preventDefault();
                
                const dx = e.touches[0].clientX - startX;
                const dy = e.touches[0].clientY - startY;
                
                // Get svg viewport dimensions for scaling
                const svgRect = svg.getBoundingClientRect();
                const scaleX = 1600 / svgRect.width;
                const scaleY = 900 / svgRect.height;
                
                // Scale touch movement to SVG coordinates
                const scaledDx = dx * scaleX;
                const scaledDy = dy * scaleY;
                
                const newX = nodeX + scaledDx;
                const newY = nodeY + scaledDy;
                
                // Update the dragged node position
                const draggedNode = document.querySelector(nodeGroup.hasAttribute('data-index') ? 
                    '.draggable-node[data-index="' + nodeGroup.getAttribute('data-index') + '"]' : 
                    '.draggable-node[data-app-node="true"]');
                
                updateNodePosition(draggedNode, newX, newY);
            }, { passive: false });
            
            // Mouse up
            document.addEventListener('mouseup', function() {
                if (isDragging) {
                    isDragging = false;
                    document.body.style.cursor = '';
                    nodeGroup.style.cursor = 'grab';
                }
            });
            
            // Touch end
            document.addEventListener('touchend', function() {
                if (isDragging) {
                    isDragging = false;
                }
            });
            
            // Touch cancel
            document.addEventListener('touchcancel', function() {
                if (isDragging) {
                    isDragging = false;
                }
            });
            
            // Hover effect to show info panel
            nodeGroup.addEventListener('mouseenter', function() {
                if (infoPanel) {
                    let nodeInfo;
                    if (this.hasAttribute('data-index')) {
                        const index = parseInt(this.getAttribute('data-index'));
                        nodeInfo = dataNodes[index];
                    } else if (this.hasAttribute('data-app-node')) {
                        nodeInfo = applicationsNode;
                    }
                    
                    if (nodeInfo) {
                        infoPanel.innerHTML = `
                            <h4>${nodeInfo.label}</h4>
                            <p>${nodeInfo.description}</p>
                        `;
                        infoPanel.classList.add('visible');
                    }
                }
            });
            
            nodeGroup.addEventListener('mouseleave', function() {
                if (infoPanel && !isDragging) {
                    infoPanel.classList.remove('visible');
                }
            });
            
            return nodeGroup;
        };
        
        // Create data nodes
        dataNodes.forEach((node, index) => {
            const dataNodeGroup = createNode(node, index);
            svg.appendChild(dataNodeGroup);
        });
        
        // Create applications node
        const applicationsNodeGroup = createNode(applicationsNode, null, false);
        svg.appendChild(applicationsNodeGroup);
        
        // Initialize paths
        updatePaths();
        
        // Add visualization caption and style
        const visualStyle = document.createElement('style');
        visualStyle.textContent = `
            .visualization-caption {
                margin-top: 15px;
                text-align: center;
                font-size: 0.9rem;
                color: var(--gray-300);
                opacity: 0.8;
            }
            
            .visualization-caption .mobile-hint {
                display: none;
                margin-top: 0.5rem;
                color: var(--primary-light);
                font-weight: 500;
            }
            
            .svg-container {
                width: 100%;
                height: 100%;
                position: relative;
                z-index: 2;
            }
            
            .draggable-node {
                cursor: grab;
                transition: filter 0.2s ease;
                touch-action: none; /* Critical for preventing scrolling on touch */
            }
            
            .draggable-node:hover {
                filter: brightness(1.2);
            }
            
            .draggable-node:active {
                cursor: grabbing;
            }
            
            @media (max-width: 768px) {
                .visualization-caption {
                    font-size: 0.8rem;
                }
                
                .visualization-caption .mobile-hint {
                    display: block;
                    font-size: 0.8rem;
                }
                
                .draggable-node {
                    filter: brightness(1.1); /* Make nodes slightly brighter on mobile for visibility */
                }
            }
        `;
        document.head.appendChild(visualStyle);
    }

    // Form submission
    const contactForm = document.getElementById('partnership-form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Get form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());
            
            // In a real application, you would send this data to a server
            console.log('Form submitted with data:', data);
            
            // Show success message
            const formElements = contactForm.elements;
            for (let i = 0; i < formElements.length; i++) {
                formElements[i].disabled = true;
            }
            
            const submitButton = contactForm.querySelector('button[type="submit"]');
            submitButton.textContent = 'Message Sent!';
            submitButton.classList.add('success');
            
            // Reset form after 3 seconds
            setTimeout(() => {
                contactForm.reset();
                submitButton.textContent = 'Submit';
                submitButton.classList.remove('success');
                
                for (let i = 0; i < formElements.length; i++) {
                    formElements[i].disabled = false;
                }
            }, 3000);
        });
    }

    // Scroll animation for elements
    const animateOnScroll = function() {
        const elements = document.querySelectorAll('.workflow-step, .publication, .team-member, .press-item');
        
        elements.forEach(element => {
            const elementPosition = element.getBoundingClientRect().top;
            const windowHeight = window.innerHeight;
            
            if (elementPosition < windowHeight - 100) {
                element.classList.add('visible');
            }
        });
    };

    // Add CSS for animation
    const style = document.createElement('style');
    style.textContent = `
        .workflow-step, .publication, .team-member, .press-item {
            opacity: 0;
            transform: translateY(20px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        
        .workflow-step.visible, .publication.visible, .team-member.visible, .press-item.visible {
            opacity: 1;
            transform: translateY(0);
        }
        
        .success {
            background-color: #10b981 !important;
            border-color: #10b981 !important;
        }
    `;
    document.head.appendChild(style);

    // Initial call and add event listener
    animateOnScroll();
    window.addEventListener('scroll', animateOnScroll);

    // Navbar scroll effect
    const handleNavbarScroll = function() {
        const nav = document.querySelector('nav');
        if (window.scrollY > 50) {
            nav.classList.add('scrolled');
        } else {
            nav.classList.remove('scrolled');
        }
    };

    // Add CSS for navbar scroll effect
    const navStyle = document.createElement('style');
    navStyle.textContent = `
        nav {
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
        }
        
        nav.scrolled {
            background-color: rgba(3, 4, 94, 0.9);
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            backdrop-filter: blur(10px);
        }
    `;
    document.head.appendChild(navStyle);

    // Initial call and add event listener
    handleNavbarScroll();
    window.addEventListener('scroll', handleNavbarScroll);

    // SVG icons for the workflow steps
    const icons = {
        'data-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z"></path>
            </svg>
        `,
        'model-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M224,128a8,8,0,0,1-8,8H184v16h8a8,8,0,0,1,0,16h-8v16a8,8,0,0,1-16,0V168H104v16a8,8,0,0,1-16,0V168H72v16a8,8,0,0,1-16,0V168H40a8,8,0,0,1,0-16h16V136H40a8,8,0,0,1,0-16H56V104H40a8,8,0,0,1,0-16H56V72a8,8,0,0,1,16,0V88h16V72a8,8,0,0,1,16,0V88h64V72a8,8,0,0,1,16,0V88h16a8,8,0,0,1,0,16H184v16h32A8,8,0,0,1,224,128ZM168,136v-16H104v16Z"></path>
            </svg>
        `,
        'latent-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M208,32H48A16,16,0,0,0,32,48V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V48A16,16,0,0,0,208,32ZM96,208H48V160H96Zm0-64H48V96H96Zm64,64H112V160h48Zm0-64H112V96h48Zm48,64H176V160h32Zm0-64H176V96h32ZM176,80V48h32V80Z"></path>
            </svg>
        `,
        'apps-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M216,56H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40V56H40A16,16,0,0,0,24,72V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V72A16,16,0,0,0,216,56ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8V56H96ZM216,72v48H40V72ZM40,200V136H216v64Z"></path>
            </svg>
        `,
        'email-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M224,48H32a8,8,0,0,0-8,8V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A8,8,0,0,0,224,48ZM203.43,64,128,133.15,52.57,64ZM216,192H40V74.19l82.59,75.71a8,8,0,0,0,10.82,0L216,74.19V192Z"></path>
            </svg>
        `,
        'location-icon': `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="#0096c7" viewBox="0 0 256 256">
                <path d="M128,16a88.1,88.1,0,0,0-88,88c0,75.3,80,132.17,83.41,134.55a8,8,0,0,0,9.18,0C136,236.17,216,179.3,216,104A88.1,88.1,0,0,0,128,16Zm0,56a32,32,0,1,1-32,32A32,32,0,0,1,128,72Z"></path>
            </svg>
        `
    };

    // Insert SVG icons
    Object.keys(icons).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = icons[id];
        }
    });

    // Add placeholders for press logos
    const pressLogos = {
        'techcrunch': 'TechCrunch',
        'nature': 'Nature',
        'forbes': 'Forbes',
        'mit': 'MIT'
    };

    Object.keys(pressLogos).forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = 'flex';
            element.style.alignItems = 'center';
            element.style.justifyContent = 'flex-start';
            element.style.fontSize = '1.25rem';
            element.style.fontWeight = '700';
            element.style.color = '#0096c7';
            element.textContent = pressLogos[id];
        }
    });
});