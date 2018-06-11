function [y, alpha] = posterize_paul(image, colorR, colorG, colorB)
r = image(:,:,1); 
g = image(:,:,2);
b = image(:,:,3);
alpha = image(:,:,1);

%make alpha layer around the object (otherwise has white background pixels)
for row = 1:length(image(:,1,3))
    for col = 1:length(image(1,:,3))
        if r(row,col) > 220 && g(row,col) > 220 && b(row,col) > 220
            alpha(row,col) = 0;
        else
            alpha(row,col) = 255;
        end
    end
end

%posterize
a = posterize(image,2,'img');
y = uint8(posterize(a,2,'img'));
r = y(:,:,1); 
g = y(:,:,2);
b = y(:,:,3);
ro = r;

%condense into 3 base colors (black white magenta)
r(ro ~= g | ro ~= b) = colorR;
g(ro ~= g | ro ~= b) = colorG;
b(ro ~= g | ro ~= b) = colorB;

y(:,:,1) = r;
y(:,:,2) = g;
y(:,:,3) = b;
end