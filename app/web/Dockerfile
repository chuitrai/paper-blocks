FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js api.js world.js /usr/share/nginx/html/
# fonts/ là tuỳ chọn; thư mục có thể chỉ chứa .gitkeep
COPY fonts /usr/share/nginx/html/fonts
# three.js đóng gói sẵn (MIT) để CSP không phải mở cho CDN
COPY vendor /usr/share/nginx/html/vendor
EXPOSE 8080
