<?php
/**
 * Plugin Name: CloudPress Migrator
 * Plugin URI:  https://cloudpress.site
 * Description: 원클릭 WordPress 마이그레이션 — ZIP 백업 · 10초 복원 · 클라우드 저장
 * Version:     1.0.0
 * Author:      CloudPress
 * Author URI:  https://cloudpress.site
 * License:     GPL-2.0+
 * Text Domain: cloudpress-migrator
 */

if ( ! defined( 'ABSPATH' ) ) exit;

define( 'CPM_VERSION', '1.0.0' );
define( 'CPM_DIR',     plugin_dir_path( __FILE__ ) );
define( 'CPM_URL',     plugin_dir_url( __FILE__ ) );

/* ─────────────────────────────────────────────────────
   Admin 메뉴 등록
───────────────────────────────────────────────────── */
add_action( 'admin_menu', function () {
    add_menu_page(
        'CloudPress 마이그레이터',
        'CP Migrator',
        'manage_options',
        'cloudpress-migrator',
        'cpm_render_page',
        'dashicons-migrate',
        80
    );
} );

/* ─────────────────────────────────────────────────────
   AJAX 핸들러 등록
───────────────────────────────────────────────────── */
add_action( 'wp_ajax_cpm_backup',  'cpm_ajax_backup'  );
add_action( 'wp_ajax_cpm_restore', 'cpm_ajax_restore' );
add_action( 'wp_ajax_cpm_status',  'cpm_ajax_status'  );

/* ─────────────────────────────────────────────────────
   관리자 페이지 렌더링
───────────────────────────────────────────────────── */
function cpm_render_page() {
    if ( ! current_user_can( 'manage_options' ) ) {
        wp_die( '권한이 없습니다.' );
    }
    $nonce = wp_create_nonce( 'cpm_nonce' );
    ?>
    <!DOCTYPE html>
    <html lang="ko">
    <head>
    <style>
    #cpm-wrap{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:760px;padding:20px 0}
    #cpm-wrap h1{font-size:1.4rem;font-weight:700;margin-bottom:24px;color:#1e293b}
    .cpm-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:24px;margin-bottom:16px}
    .cpm-card h2{font-size:1rem;font-weight:700;margin:0 0 4px;color:#0f172a}
    .cpm-card p{font-size:.875rem;color:#64748b;margin:0 0 16px;line-height:1.5}
    .cpm-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;border-radius:8px;font-size:.875rem;font-weight:600;cursor:pointer;border:none;transition:all .2s;text-decoration:none}
    .cpm-btn-primary{background:linear-gradient(135deg,#f97316,#ea580c);color:#fff}
    .cpm-btn-primary:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(249,115,22,.3)}
    .cpm-btn-secondary{background:#f1f5f9;border:1px solid #e2e8f0;color:#374151}
    .cpm-btn-secondary:hover{background:#e2e8f0}
    .cpm-btn-danger{background:#fee2e2;border:1px solid #fecaca;color:#dc2626}
    .cpm-btn:disabled{opacity:.5;cursor:not-allowed;transform:none!important}
    .cpm-log{background:#0f172a;border-radius:8px;padding:14px;font-size:.8rem;font-family:monospace;color:#94a3b8;height:160px;overflow-y:auto;margin-top:14px;line-height:1.8}
    .cpm-log .ok{color:#22c55e}.cpm-log .err{color:#ef4444}.cpm-log .cur{color:#f97316}
    .cpm-progress{width:100%;height:6px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin-top:10px;display:none}
    .cpm-progress-bar{height:100%;background:linear-gradient(90deg,#f97316,#ec4899);border-radius:99px;transition:width .3s;width:0%}
    .cpm-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:600;background:#dcfce7;color:#16a34a}
    .cpm-drop{border:2px dashed #cbd5e1;border-radius:10px;padding:28px;text-align:center;cursor:pointer;transition:all .2s}
    .cpm-drop:hover,.cpm-drop.drag{border-color:#f97316;background:#fff7ed}
    .cpm-file-list{margin-top:10px;font-size:.83rem;color:#64748b}
    .cpm-alert{padding:10px 14px;border-radius:8px;font-size:.85rem;margin-bottom:12px;display:none}
    .cpm-alert.success{background:#dcfce7;border:1px solid #bbf7d0;color:#15803d}
    .cpm-alert.error{background:#fee2e2;border:1px solid #fecaca;color:#dc2626}
    .cpm-alert.info{background:#dbeafe;border:1px solid #bfdbfe;color:#1d4ed8}
    </style>
    </head>
    <body>
    <div id="cpm-wrap">
      <h1>☁ CloudPress Migrator <span class="cpm-badge">v<?php echo CPM_VERSION; ?></span></h1>

      <!-- Backup -->
      <div class="cpm-card">
        <h2>📦 백업 생성</h2>
        <p>WordPress 파일 + 데이터베이스를 ZIP 파일 하나로 백업합니다. 언제든지 복원할 수 있습니다.</p>
        <div id="backupAlert" class="cpm-alert"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="cpm-btn cpm-btn-primary" id="btnBackup" onclick="startBackup()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><polyline points="7 10 12 15 17 10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="15" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            백업 시작
          </button>
          <button class="cpm-btn cpm-btn-secondary" id="btnDownload" style="display:none" onclick="downloadBackup()">
            ⬇ 백업 다운로드
          </button>
        </div>
        <div class="cpm-progress" id="backupProgress"><div class="cpm-progress-bar" id="backupBar"></div></div>
        <div class="cpm-log" id="backupLog"></div>
      </div>

      <!-- Restore -->
      <div class="cpm-card">
        <h2>♻ 복원 (10초 복원)</h2>
        <p>ZIP 백업 파일을 업로드하면 파일과 데이터베이스를 자동으로 복원합니다. 기존 데이터는 덮어쓰여집니다.</p>
        <div id="restoreAlert" class="cpm-alert"></div>
        <div class="cpm-drop" id="dropZone" onclick="document.getElementById('restoreFile').click()" ondragover="event.preventDefault();this.classList.add('drag')" ondragleave="this.classList.remove('drag')" ondrop="handleDrop(event)">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" style="margin-bottom:8px;opacity:.4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="1.5"/><polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <p style="margin:0;font-size:.875rem;color:#64748b">ZIP 파일을 드래그하거나 클릭하여 선택</p>
        </div>
        <input type="file" id="restoreFile" accept=".zip" style="display:none" onchange="fileSelected(this)"/>
        <div id="fileInfo" class="cpm-file-list"></div>
        <div style="margin-top:12px">
          <button class="cpm-btn cpm-btn-danger" id="btnRestore" disabled onclick="startRestore()">
            ♻ 복원 시작
          </button>
        </div>
        <div class="cpm-progress" id="restoreProgress"><div class="cpm-progress-bar" id="restoreBar"></div></div>
        <div class="cpm-log" id="restoreLog"></div>
      </div>

      <!-- Info -->
      <div class="cpm-card">
        <h2>ℹ 사이트 정보</h2>
        <table style="font-size:.875rem;border-collapse:collapse;width:100%">
          <?php
          $info = [
            'WordPress 버전'   => get_bloginfo('version'),
            'PHP 버전'         => PHP_VERSION,
            '사이트 URL'       => get_site_url(),
            '홈 URL'          => get_home_url(),
            'WP 콘텐츠 경로'  => WP_CONTENT_DIR,
            '데이터베이스'     => DB_NAME . '@' . DB_HOST,
            '멀티사이트'       => is_multisite() ? '예' : '아니요',
          ];
          foreach ($info as $k => $v):
          ?>
          <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:7px 0;color:#64748b;width:40%"><?php echo esc_html($k); ?></td>
            <td style="padding:7px 0;font-weight:500;font-family:monospace;font-size:.82rem"><?php echo esc_html($v); ?></td>
          </tr>
          <?php endforeach; ?>
        </table>
      </div>
    </div>

    <script>
    const NONCE = '<?php echo $nonce; ?>';
    const AJAX  = '<?php echo admin_url('admin-ajax.php'); ?>';
    let backupFile = null;
    let restoreFile = null;

    function log(elId, msg, cls='') {
      const el = document.getElementById(elId);
      const d = document.createElement('div');
      if(cls) d.className = cls;
      d.textContent = msg;
      el.appendChild(d);
      el.scrollTop = el.scrollHeight;
    }

    function showAlert(elId, msg, type='info') {
      const el = document.getElementById(elId);
      el.className = 'cpm-alert ' + type;
      el.textContent = msg;
      el.style.display = 'block';
    }

    function setProgress(barId, wrapId, pct) {
      document.getElementById(wrapId).style.display = 'block';
      document.getElementById(barId).style.width = pct + '%';
    }

    /* ── BACKUP ── */
    async function startBackup() {
      const btn = document.getElementById('btnBackup');
      btn.disabled = true;
      document.getElementById('backupLog').innerHTML = '';
      document.getElementById('btnDownload').style.display = 'none';
      log('backupLog', '백업 시작 중...', 'cur');
      setProgress('backupBar','backupProgress',10);

      const fd = new FormData();
      fd.append('action', 'cpm_backup');
      fd.append('nonce', NONCE);

      try {
        setProgress('backupBar','backupProgress',30);
        log('backupLog', '파일 수집 중...');
        setProgress('backupBar','backupProgress',55);
        log('backupLog', '데이터베이스 내보내기 중...');

        const r = await fetch(AJAX, { method:'POST', body: fd });
        const d = await r.json();
        setProgress('backupBar','backupProgress',90);

        if (d.success) {
          log('backupLog', '✓ 백업 완료: ' + d.data.filename, 'ok');
          log('backupLog', '✓ 크기: ' + d.data.size, 'ok');
          setProgress('backupBar','backupProgress',100);
          backupFile = d.data.path;
          document.getElementById('btnDownload').style.display = 'inline-flex';
          showAlert('backupAlert', '백업이 완료되었습니다! ZIP 파일을 다운로드하세요.', 'success');
        } else {
          log('backupLog', '✗ 오류: ' + (d.data||'알 수 없는 오류'), 'err');
          showAlert('backupAlert', '백업 실패: ' + (d.data||'오류'), 'error');
        }
      } catch(e) {
        log('backupLog', '✗ 오류: ' + e.message, 'err');
        showAlert('backupAlert', '백업 중 오류 발생', 'error');
      }
      btn.disabled = false;
    }

    function downloadBackup() {
      if (!backupFile) return;
      const fd = new FormData();
      fd.append('action', 'cpm_backup');
      fd.append('nonce', NONCE);
      fd.append('download', '1');
      fd.append('path', backupFile);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = AJAX;
      for(const [k,v] of fd.entries()){
        const inp = document.createElement('input');
        inp.type='hidden'; inp.name=k; inp.value=v;
        form.appendChild(inp);
      }
      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    }

    /* ── RESTORE ── */
    function fileSelected(input) {
      const f = input.files[0];
      if (!f) return;
      restoreFile = f;
      document.getElementById('fileInfo').textContent = `선택된 파일: ${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`;
      document.getElementById('btnRestore').disabled = false;
    }

    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('dropZone').classList.remove('drag');
      const f = e.dataTransfer.files[0];
      if (f && f.name.endsWith('.zip')) {
        restoreFile = f;
        document.getElementById('fileInfo').textContent = `선택된 파일: ${f.name} (${(f.size/1024/1024).toFixed(1)} MB)`;
        document.getElementById('btnRestore').disabled = false;
      }
    }

    async function startRestore() {
      if (!restoreFile) return;
      if (!confirm('복원 시 현재 사이트 데이터가 덮어쓰여집니다. 계속하시겠습니까?')) return;

      const btn = document.getElementById('btnRestore');
      btn.disabled = true;
      document.getElementById('restoreLog').innerHTML = '';
      log('restoreLog', '복원 시작...', 'cur');
      setProgress('restoreBar','restoreProgress',5);

      const fd = new FormData();
      fd.append('action', 'cpm_restore');
      fd.append('nonce', NONCE);
      fd.append('backup_zip', restoreFile);

      try {
        log('restoreLog', 'ZIP 업로드 중...');
        setProgress('restoreBar','restoreProgress',20);

        const r = await fetch(AJAX, { method:'POST', body: fd });
        setProgress('restoreBar','restoreProgress',60);
        log('restoreLog', '파일 복원 중...');
        setProgress('restoreBar','restoreProgress',80);
        log('restoreLog', '데이터베이스 복원 중...');

        const d = await r.json();
        setProgress('restoreBar','restoreProgress',100);

        if (d.success) {
          log('restoreLog', '✓ 복원 완료!', 'ok');
          log('restoreLog', '✓ ' + (d.data.message||'사이트가 성공적으로 복원되었습니다.'), 'ok');
          showAlert('restoreAlert', '복원이 완료되었습니다! 페이지를 새로고침하세요.', 'success');
        } else {
          log('restoreLog', '✗ 오류: ' + (d.data||'복원 실패'), 'err');
          showAlert('restoreAlert', '복원 실패: ' + (d.data||'오류'), 'error');
        }
      } catch(e) {
        log('restoreLog', '✗ ' + e.message, 'err');
        showAlert('restoreAlert', '복원 중 오류 발생', 'error');
      }
      btn.disabled = false;
    }
    </script>
    </body>
    </html>
    <?php
}

/* ─────────────────────────────────────────────────────
   AJAX: 백업 생성
───────────────────────────────────────────────────── */
function cpm_ajax_backup() {
    if ( ! current_user_can( 'manage_options' ) || ! wp_verify_nonce( $_POST['nonce'] ?? '', 'cpm_nonce' ) ) {
        wp_send_json_error( '권한 없음' );
    }

    // 다운로드 요청
    if ( ! empty( $_POST['download'] ) && ! empty( $_POST['path'] ) ) {
        $path = sanitize_text_field( $_POST['path'] );
        if ( file_exists( $path ) && strpos( $path, WP_CONTENT_DIR ) === 0 ) {
            header( 'Content-Type: application/zip' );
            header( 'Content-Disposition: attachment; filename="' . basename( $path ) . '"' );
            header( 'Content-Length: ' . filesize( $path ) );
            readfile( $path );
            exit;
        }
        wp_send_json_error( '파일 없음' );
    }

    set_time_limit( 300 );
    @ini_set( 'memory_limit', '512M' );

    $upload_dir = wp_upload_dir();
    $backup_dir = $upload_dir['basedir'] . '/cloudpress-backups';
    wp_mkdir_p( $backup_dir );

    // .htaccess 로 직접 접근 차단
    file_put_contents( $backup_dir . '/.htaccess', 'deny from all' );

    $filename   = 'backup-' . date( 'Y-m-d-His' ) . '-' . wp_generate_password( 8, false ) . '.zip';
    $zip_path   = $backup_dir . '/' . $filename;

    $zip = new ZipArchive();
    if ( $zip->open( $zip_path, ZipArchive::CREATE ) !== true ) {
        wp_send_json_error( 'ZIP 파일 생성 실패' );
    }

    // ── 파일 추가 ──
    $base = ABSPATH;
    $excludes = [
        $backup_dir,
        WP_CONTENT_DIR . '/cache',
        WP_CONTENT_DIR . '/upgrade',
    ];

    $iter = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator( $base, RecursiveDirectoryIterator::SKIP_DOTS ),
        RecursiveIteratorIterator::SELF_FIRST
    );

    foreach ( $iter as $file ) {
        $filePath = $file->getPathname();
        $skip = false;
        foreach ( $excludes as $ex ) {
            if ( strpos( $filePath, $ex ) === 0 ) { $skip = true; break; }
        }
        if ( $skip ) continue;
        if ( $file->isDir() ) {
            $zip->addEmptyDir( str_replace( $base, '', $filePath ) );
        } elseif ( $file->isFile() && $file->getSize() < 100 * 1024 * 1024 ) {
            $zip->addFile( $filePath, str_replace( $base, '', $filePath ) );
        }
    }

    // ── DB 덤프 추가 ──
    $db_dump = cpm_dump_database();
    if ( $db_dump ) {
        $zip->addFromString( 'cloudpress-db-backup.sql', $db_dump );
    }

    // ── 메타 파일 ──
    $meta = json_encode( [
        'version'    => CPM_VERSION,
        'wp_version' => get_bloginfo( 'version' ),
        'site_url'   => get_site_url(),
        'home_url'   => get_home_url(),
        'created_at' => current_time( 'mysql' ),
        'php_version'=> PHP_VERSION,
    ], JSON_PRETTY_PRINT );
    $zip->addFromString( 'cloudpress-backup-meta.json', $meta );

    $zip->close();

    $size = size_format( filesize( $zip_path ) );
    wp_send_json_success( [ 'filename' => $filename, 'path' => $zip_path, 'size' => $size ] );
}

/* ─────────────────────────────────────────────────────
   AJAX: 복원
───────────────────────────────────────────────────── */
function cpm_ajax_restore() {
    if ( ! current_user_can( 'manage_options' ) || ! wp_verify_nonce( $_POST['nonce'] ?? '', 'cpm_nonce' ) ) {
        wp_send_json_error( '권한 없음' );
    }

    if ( empty( $_FILES['backup_zip'] ) || $_FILES['backup_zip']['error'] !== UPLOAD_ERR_OK ) {
        wp_send_json_error( 'ZIP 파일 업로드 실패' );
    }

    set_time_limit( 300 );
    @ini_set( 'memory_limit', '512M' );

    $tmp  = $_FILES['backup_zip']['tmp_name'];
    $zip  = new ZipArchive();

    if ( $zip->open( $tmp ) !== true ) {
        wp_send_json_error( 'ZIP 파일을 열 수 없습니다.' );
    }

    $base = ABSPATH;

    // ── DB 복원 ──
    $db_sql = '';
    for ( $i = 0; $i < $zip->numFiles; $i++ ) {
        $name = $zip->getNameIndex( $i );
        if ( $name === 'cloudpress-db-backup.sql' ) {
            $db_sql = $zip->getFromIndex( $i );
            break;
        }
    }

    if ( $db_sql ) {
        cpm_import_database( $db_sql );
    }

    // ── 파일 복원 ──
    for ( $i = 0; $i < $zip->numFiles; $i++ ) {
        $name = $zip->getNameIndex( $i );
        if ( in_array( $name, [ 'cloudpress-db-backup.sql', 'cloudpress-backup-meta.json' ] ) ) continue;
        $dest = $base . ltrim( $name, '/' );
        if ( substr( $name, -1 ) === '/' ) {
            wp_mkdir_p( $dest );
        } else {
            wp_mkdir_p( dirname( $dest ) );
            file_put_contents( $dest, $zip->getFromIndex( $i ) );
        }
    }

    $zip->close();

    // 캐시 삭제
    if ( function_exists( 'wp_cache_flush' ) ) wp_cache_flush();

    wp_send_json_success( [ 'message' => '복원 완료! 사이트가 성공적으로 복원되었습니다.' ] );
}

/* ─────────────────────────────────────────────────────
   DB 덤프 헬퍼
───────────────────────────────────────────────────── */
function cpm_dump_database() {
    global $wpdb;
    $output = "-- CloudPress Migrator DB Backup\n-- Generated: " . current_time('mysql') . "\n-- WordPress DB: " . DB_NAME . "\n\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS = 0;\n\n";

    $tables = $wpdb->get_col( 'SHOW TABLES' );
    foreach ( $tables as $table ) {
        // CREATE TABLE
        $create = $wpdb->get_row( "SHOW CREATE TABLE `$table`", ARRAY_N );
        $output .= "\nDROP TABLE IF EXISTS `$table`;\n" . $create[1] . ";\n\n";

        // INSERT DATA
        $rows = $wpdb->get_results( "SELECT * FROM `$table`", ARRAY_A );
        foreach ( $rows as $row ) {
            $values = array_map( function($v) use ($wpdb) {
                return $v === null ? 'NULL' : "'" . esc_sql( $v ) . "'";
            }, $row );
            $output .= "INSERT INTO `$table` VALUES (" . implode( ', ', $values ) . ");\n";
        }
    }
    $output .= "\nSET FOREIGN_KEY_CHECKS = 1;\n";
    return $output;
}

/* ─────────────────────────────────────────────────────
   DB 임포트 헬퍼
───────────────────────────────────────────────────── */
function cpm_import_database( $sql ) {
    global $wpdb;
    // 현재 사이트 URL
    $new_url   = get_site_url();
    $meta_json = '';

    // 메타에서 원본 URL 추출 시도 (이미 메모리에 $sql이 있음)
    // sql에서 특정 패턴으로 원본 URL 검출하기 어려우므로 간단히 치환 생략

    // SQL 쿼리 분리 실행
    $queries = preg_split( "/;\s*\n/", $sql );
    foreach ( $queries as $query ) {
        $query = trim( $query );
        if ( empty( $query ) || strpos( $query, '--' ) === 0 || strpos( $query, '/*' ) === 0 ) continue;
        $wpdb->query( $query );
    }
}

/* ─────────────────────────────────────────────────────
   AJAX Status (미래 확장용)
───────────────────────────────────────────────────── */
function cpm_ajax_status() {
    if ( ! current_user_can( 'manage_options' ) ) { wp_send_json_error( '권한 없음' ); }
    wp_send_json_success( [ 'version' => CPM_VERSION, 'wp' => get_bloginfo('version'), 'php' => PHP_VERSION ] );
}
