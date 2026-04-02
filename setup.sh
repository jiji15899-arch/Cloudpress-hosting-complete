#!/bin/bash
# ============================================================
# CloudPress VPS 자동 설치 스크립트
# Oracle Cloud Always Free ARM Ubuntu 22.04 기준
# 실행: sudo bash setup.sh
# ============================================================
set -e

SITE_DOMAIN="${SITE_DOMAIN:-cloudpress.site}"
PROVISIONER_SECRET="${PROVISIONER_SECRET:-$(openssl rand -hex 32)}"
DB_ROOT_PASS="${DB_ROOT_PASS:-$(openssl rand -hex 24)}"
ADMIN_EMAIL="${ADMIN_EMAIL:-choichoi3227@gmail.com}"

echo "========================================"
echo " CloudPress VPS 설치 시작"
echo " 도메인: $SITE_DOMAIN"
echo "========================================"

# ── 1. 시스템 업데이트 ──
apt-get update -y && apt-get upgrade -y
apt-get install -y curl wget git ufw fail2ban certbot python3-certbot-nginx \
  nginx mariadb-server redis-server nodejs npm unzip

# ── 2. Docker 설치 ──
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# ── 3. MariaDB 보안 설정 ──
systemctl enable --now mariadb
mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_ROOT_PASS}';"
mysql -u root -p"${DB_ROOT_PASS}" -e "DELETE FROM mysql.user WHERE User='';"
mysql -u root -p"${DB_ROOT_PASS}" -e "DROP DATABASE IF EXISTS test;"
mysql -u root -p"${DB_ROOT_PASS}" -e "FLUSH PRIVILEGES;"

# MariaDB 원격 접속 허용 (Docker 컨테이너용)
sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mariadb.conf.d/50-server.cnf
systemctl restart mariadb

# ── 4. Redis 설정 ──
sed -i 's/^bind 127.0.0.1.*/bind 0.0.0.0/' /etc/redis/redis.conf
sed -i 's/^# maxmemory .*/maxmemory 512mb/' /etc/redis/redis.conf
sed -i 's/^# maxmemory-policy .*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
systemctl enable --now redis-server

# ── 5. Nginx 기본 설정 ──
mkdir -p /opt/wordpress
cat > /etc/nginx/sites-available/default << 'NGINX'
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
NGINX
nginx -t && systemctl reload nginx

# ── 6. 방화벽 ──
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3721/tcp   # 프로비저너 API
ufw --force enable

# ── 7. Provisioner 설치 ──
mkdir -p /opt/cloudpress-provisioner
cp -r /tmp/cloudpress-provisioner/* /opt/cloudpress-provisioner/ 2>/dev/null || true

cd /opt/cloudpress-provisioner
npm init -y 2>/dev/null
npm install express 2>/dev/null

# 환경변수 파일 생성
cat > /opt/cloudpress-provisioner/.env << ENV
PORT=3721
PROVISIONER_SECRET=${PROVISIONER_SECRET}
SITE_DOMAIN=${SITE_DOMAIN}
DB_HOST=127.0.0.1
DB_ROOT=root
DB_ROOT_PASS=${DB_ROOT_PASS}
NODE_ENV=production
ENV

chmod 600 /opt/cloudpress-provisioner/.env

# systemd 서비스 등록
cat > /etc/systemd/system/cloudpress-provisioner.service << SERVICE
[Unit]
Description=CloudPress WordPress Provisioner
After=network.target mariadb.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/cloudpress-provisioner
EnvironmentFile=/opt/cloudpress-provisioner/.env
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now cloudpress-provisioner

# ── 8. Wildcard DNS 확인 ──
echo ""
echo "========================================"
echo " 설치 완료!"
echo "========================================"
echo ""
echo "⚠️  Cloudflare DNS 설정 필요:"
echo "   *.${SITE_DOMAIN}  →  A  →  $(curl -s ifconfig.me)"
echo ""
echo "🔑 Provisioner Secret Key:"
echo "   ${PROVISIONER_SECRET}"
echo ""
echo "📋 Cloudflare Pages 환경변수에 입력:"
echo "   PROVISIONER_URL    = http://$(curl -s ifconfig.me):3721"
echo "   PROVISIONER_SECRET = ${PROVISIONER_SECRET}"
echo ""
echo "🔒 MariaDB Root Password: ${DB_ROOT_PASS}"
echo "   (안전한 곳에 보관하세요)"
echo ""
