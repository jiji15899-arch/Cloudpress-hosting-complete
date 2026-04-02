// provisioner/server.js
// Oracle Cloud Free VPS에서 실행 — WordPress Docker 컨테이너 관리
'use strict';

const express  = require('express');
const { exec, execSync } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');

const app    = express();
const PORT   = process.env.PORT || 3721;
const SECRET = process.env.PROVISIONER_SECRET || 'change-me';
const DOMAIN = process.env.SITE_DOMAIN || 'cloudpress.site';
const WP_VER = process.env.WP_VERSION || 'latest';

app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  if (req.headers['x-api-key'] !== SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

/* ─────────────────────────────────────────
   POST /provision — WordPress 신규 개설
   ───────────────────────────────────────── */
app.post('/provision', async (req, res) => {
  const { siteId, subdomain, phpVersion = '8.3' } = req.body;
  if (!siteId || !subdomain) return res.status(400).json({ error: 'siteId, subdomain required' });

  const containerName = `wp_${subdomain}`;
  const dbName        = `db_${subdomain.replace(/-/g, '_')}`;
  const dbUser        = `u_${subdomain.replace(/-/g, '_')}`;
  const dbPass        = genPass(24);
  const wpAdminPass   = genPass(16);
  const wpAdminUser   = 'admin';
  const wpAdminEmail  = `admin@${subdomain}.${DOMAIN}`;
  const port          = await getFreePort(8000, 9999);
  const siteUrl       = `https://${subdomain}.${DOMAIN}`;

  try {
    // 1. MariaDB 데이터베이스 / 사용자 생성
    runSQL(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    runSQL(`CREATE USER IF NOT EXISTS '${dbUser}'@'%' IDENTIFIED BY '${dbPass}';`);
    runSQL(`GRANT ALL PRIVILEGES ON \`${dbName}\`.* TO '${dbUser}'@'%'; FLUSH PRIVILEGES;`);

    // 2. WordPress 디렉터리 생성 + wp-config
    const wpDir = `/opt/wordpress/${subdomain}`;
    fs.mkdirSync(wpDir, { recursive: true });

    // 3. Docker 컨테이너 실행 (PHP-FPM + Nginx + WP)
    const dockerRun = [
      'docker run -d',
      `--name ${containerName}`,
      `--restart unless-stopped`,
      `-p 127.0.0.1:${port}:80`,
      `-v ${wpDir}:/var/www/html`,
      `-e WORDPRESS_DB_HOST=host-gateway`,
      `-e WORDPRESS_DB_NAME=${dbName}`,
      `-e WORDPRESS_DB_USER=${dbUser}`,
      `-e WORDPRESS_DB_PASSWORD=${dbPass}`,
      `-e WORDPRESS_TABLE_PREFIX=wp_`,
      `-e WORDPRESS_DEBUG=false`,
      `-e PHP_MEMORY_LIMIT=512M`,
      `-e PHP_MAX_EXECUTION_TIME=300`,
      `--add-host=host-gateway:host-gateway`,
      `--memory=512m`,
      `--cpus=0.5`,
      `wordpress:${WP_VER}-php${phpVersion}-apache`,
    ].join(' ');

    execSync(dockerRun);

    // 4. Nginx 리버스 프록시 추가
    const nginxConf = generateNginxConf(subdomain, DOMAIN, port);
    fs.writeFileSync(`/etc/nginx/sites-available/${subdomain}`, nginxConf);
    execSync(`ln -sf /etc/nginx/sites-available/${subdomain} /etc/nginx/sites-enabled/${subdomain}`);
    execSync('nginx -t && systemctl reload nginx');

    // 5. Let's Encrypt SSL (certbot)
    try {
      execSync(`certbot --nginx -d ${subdomain}.${DOMAIN} --non-interactive --agree-tos -m admin@${DOMAIN} --redirect`, { timeout: 120000 });
    } catch (e) {
      console.warn('SSL 발급 실패 (나중에 재시도):', e.message);
    }

    // 6. WordPress 초기 설치 (WP-CLI)
    await sleep(8000); // 컨테이너 부팅 대기
    execSync(`docker exec ${containerName} bash -c "curl -o /usr/local/bin/wp https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar && chmod +x /usr/local/bin/wp"`, { timeout: 30000 });
    execSync(`docker exec ${containerName} wp core install --url="${siteUrl}" --title="My WordPress Site" --admin_user="${wpAdminUser}" --admin_password="${wpAdminPass}" --admin_email="${wpAdminEmail}" --skip-email --allow-root`, { timeout: 60000 });

    // 7. 플러그인 설치: LiteSpeed Cache
    try {
      execSync(`docker exec ${containerName} wp plugin install litespeed-cache --activate --allow-root`, { timeout: 60000 });
    } catch (e) { console.warn('LiteSpeed Cache 설치 실패:', e.message); }

    // 8. CloudPress Migrator 플러그인 설치
    const migratorSrc = path.join(__dirname, '../wp-plugin/cloudpress-migrator');
    if (fs.existsSync(migratorSrc)) {
      execSync(`docker cp ${migratorSrc} ${containerName}:/var/www/html/wp-content/plugins/cloudpress-migrator`);
      execSync(`docker exec ${containerName} wp plugin activate cloudpress-migrator --allow-root`);
    }

    // 9. Redis 오브젝트 캐시 설정
    try {
      execSync(`docker exec ${containerName} wp plugin install redis-cache --activate --allow-root`);
      execSync(`docker exec ${containerName} bash -c "echo \"define('WP_REDIS_HOST', 'host-gateway'); define('WP_REDIS_PORT', 6379);\" >> /var/www/html/wp-config.php"`);
      execSync(`docker exec ${containerName} wp redis enable --allow-root`);
    } catch (e) { console.warn('Redis 설정 실패:', e.message); }

    // 10. wp-config 보안 강화
    execSync(`docker exec ${containerName} wp config set WP_DEBUG false --allow-root`);
    execSync(`docker exec ${containerName} wp config set DISALLOW_FILE_EDIT true --allow-root`);

    // 컨테이너 정보 저장
    const info = { siteId, subdomain, containerName, port, dbName, dbUser, dbPass, wpAdminUser, wpAdminPass, siteUrl, createdAt: Date.now() };
    fs.writeFileSync(`/opt/wordpress/${subdomain}/.cp-info.json`, JSON.stringify(info, null, 2));

    return res.json({
      containerId: containerName,
      wpUrl: siteUrl,
      wpAdminUrl: siteUrl + '/wp-admin',
      wpUsername: wpAdminUser,
      wpPassword: wpAdminPass,
    });

  } catch (e) {
    console.error('Provision error:', e);
    // 실패 시 정리
    try { execSync(`docker rm -f ${containerName}`); } catch (_) {}
    try { runSQL(`DROP DATABASE IF EXISTS \`${dbName}\``); } catch (_) {}
    try { runSQL(`DROP USER IF EXISTS '${dbUser}'@'%'`); } catch (_) {}
    try { fs.unlinkSync(`/etc/nginx/sites-enabled/${subdomain}`); } catch (_) {}
    try { fs.unlinkSync(`/etc/nginx/sites-available/${subdomain}`); } catch (_) {}
    try { execSync('systemctl reload nginx'); } catch (_) {}
    return res.status(500).json({ error: e.message });
  }
});

/* ─────────────────────────────────────────
   GET /provision/:id/status
   ───────────────────────────────────────── */
app.get('/provision/:id/status', (req, res) => {
  const name = req.params.id;
  try {
    const out = execSync(`docker inspect --format='{{.State.Status}}' ${name}`).toString().trim();
    res.json({ status: out === 'running' ? 'active' : out });
  } catch (_) {
    res.json({ status: 'not_found' });
  }
});

/* ─────────────────────────────────────────
   DELETE /provision/:id — 사이트 삭제
   ───────────────────────────────────────── */
app.delete('/provision/:id', (req, res) => {
  const name      = req.params.id;
  const subdomain = name.replace('wp_', '');

  try { execSync(`docker rm -f ${name}`); } catch (_) {}

  // DB 정보 파일에서 읽기
  const infoFile = `/opt/wordpress/${subdomain}/.cp-info.json`;
  if (fs.existsSync(infoFile)) {
    try {
      const info = JSON.parse(fs.readFileSync(infoFile, 'utf8'));
      runSQL(`DROP DATABASE IF EXISTS \`${info.dbName}\``);
      runSQL(`DROP USER IF EXISTS '${info.dbUser}'@'%'`);
    } catch (_) {}
  }

  try { execSync(`rm -rf /opt/wordpress/${subdomain}`); } catch (_) {}
  try { fs.unlinkSync(`/etc/nginx/sites-enabled/${subdomain}`); } catch (_) {}
  try { fs.unlinkSync(`/etc/nginx/sites-available/${subdomain}`); } catch (_) {}
  try { execSync('systemctl reload nginx'); } catch (_) {}
  try { execSync(`certbot delete --cert-name ${subdomain}.${process.env.SITE_DOMAIN || 'cloudpress.site'} --non-interactive`); } catch (_) {}

  res.json({ ok: true });
});

/* ── Helpers ── */
function runSQL(sql) {
  const host     = process.env.DB_HOST     || '127.0.0.1';
  const user     = process.env.DB_ROOT     || 'root';
  const password = process.env.DB_ROOT_PASS || '';
  execSync(`mysql -h${host} -u${user} -p${password} -e "${sql.replace(/"/g, '\\"')}"`);
}

function generateNginxConf(subdomain, domain, port) {
  return `server {
    listen 80;
    server_name ${subdomain}.${domain};

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
        client_max_body_size 256M;
    }
}
`;
}

async function getFreePort(min, max) {
  const used = execSync("ss -tlnp | awk '{print $4}' | grep -oP '(?<=:)\\d+' || true").toString()
    .split('\n').map(Number).filter(Boolean);
  for (let p = min; p <= max; p++) {
    if (!used.includes(p)) return p;
  }
  throw new Error('사용 가능한 포트 없음');
}

function genPass(len = 16) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!';
  return [...crypto.randomBytes(len)].map(b => chars[b % chars.length]).join('');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

app.get('/health', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, '0.0.0.0', () => console.log(`CloudPress Provisioner 실행 중: http://0.0.0.0:${PORT}`));
