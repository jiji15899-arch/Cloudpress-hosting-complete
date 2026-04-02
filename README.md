# ☁ CloudPress v2.0 — 실제 WordPress 호스팅 플랫폼

## 📁 전체 구조

```
cloudpress/
├── functions/                    # Cloudflare Pages Functions (백엔드 API)
│   ├── _lib/
│   │   ├── utils.js              # 공통 유틸리티 (인증, DB, 해시)
│   │   └── provisioner.js        # VPS 프로비저너 클라이언트
│   └── api/
│       ├── auth/                 # 회원가입·로그인·로그아웃·세션
│       ├── sites/                # WordPress 개설·조회·삭제·도메인
│       ├── user/                 # 프로필 수정·비밀번호 변경
│       ├── admin/                # 어드민 전용 (통계·사용자·사이트·공지·매출·설정)
│       └── payments/             # 토스페이먼츠 결제
├── public/                       # 프론트엔드 (Cloudflare Pages 정적 서빙)
│   ├── app.js                    # API 클라이언트 (localStorage 완전 제거)
│   ├── auth.html                 # 로그인·회원가입
│   ├── dashboard.html            # 사용자 대시보드
│   ├── create.html               # WordPress 개설 위저드
│   ├── site.html                 # 사이트 상세·커스텀 도메인
│   ├── account.html              # 계정 설정
│   ├── pricing.html              # 요금제·토스 결제
│   ├── payment-success.html      # 결제 완료
│   ├── payment-fail.html         # 결제 실패
│   └── admin.html                # 어드민 패널 SPA
├── provisioner/                  # Oracle Cloud VPS에서 실행
│   ├── server.js                 # WordPress Docker 프로비저너
│   ├── setup.sh                  # VPS 자동 설치 스크립트
│   └── package.json
├── wp-plugin/
│   └── cloudpress-migrator/      # WordPress 마이그레이션 플러그인
│       └── cloudpress-migrator.php
├── schema.sql                    # D1 데이터베이스 스키마
└── wrangler.toml                 # Cloudflare 배포 설정
```

---

## 🚀 배포 완전 가이드

### STEP 1 — Oracle Cloud Free VPS 준비

1. [cloud.oracle.com](https://cloud.oracle.com) → Always Free ARM 인스턴스 생성
   - Shape: `VM.Standard.A1.Flex` (4 OCPU, 24GB RAM — 무료)
   - OS: Ubuntu 22.04
   - 포트 열기: 22, 80, 443, 3721

2. VPS에 설치 스크립트 실행:
```bash
# provisioner 폴더 전체를 VPS로 복사
scp -r provisioner/ ubuntu@YOUR_VPS_IP:/tmp/cloudpress-provisioner/

# SSH 접속 후 실행
ssh ubuntu@YOUR_VPS_IP
export SITE_DOMAIN="cloudpress.site"
export ADMIN_EMAIL="choichoi3227@gmail.com"
sudo bash /tmp/cloudpress-provisioner/setup.sh
```

3. 출력된 **PROVISIONER_SECRET** 과 **VPS IP** 를 저장해두세요.

---

### STEP 2 — Cloudflare 설정

#### A. DNS 설정 (Cloudflare Dashboard → DNS)
```
cloudpress.site        A     YOUR_VPS_IP    (프록시: ✅)
*.cloudpress.site      A     YOUR_VPS_IP    (프록시: ✅)
```

#### B. D1 데이터베이스 생성
```bash
npm install -g wrangler
wrangler login
wrangler d1 create cloudpress-db
# → 출력된 database_id 를 wrangler.toml 에 입력
```

#### C. KV 네임스페이스 생성 (세션)
```bash
wrangler kv:namespace create SESSIONS
# → 출력된 id 를 wrangler.toml 에 입력
```

#### D. DB 스키마 초기화
```bash
wrangler d1 execute cloudpress-db --file=schema.sql
```

---

### STEP 3 — 환경변수 설정

Cloudflare Dashboard → Pages → 프로젝트 → Settings → Environment variables:

| 변수명 | 값 | 필수 |
|--------|-----|------|
| `PROVISIONER_URL` | `http://YOUR_VPS_IP:3721` | ✅ |
| `PROVISIONER_SECRET` | setup.sh 출력 시크릿 | ✅ |
| `SITE_DOMAIN` | `cloudpress.site` | ✅ |
| `ADMIN_EMAIL` | `choichoi3227@gmail.com` | ✅ |
| `JWT_SECRET` | 랜덤 32자 문자열 | ✅ |
| `TOSS_CLIENT_KEY` | `live_ck_...` | 결제 시 |
| `TOSS_SECRET_KEY` | `live_sk_...` | 결제 시 |
| `CF_API_TOKEN` | Cloudflare API 토큰 | 커스텀 도메인 시 |
| `CF_ZONE_ID` | Cloudflare Zone ID | 커스텀 도메인 시 |

---

### STEP 4 — Cloudflare Pages 배포

```bash
git init && git add . && git commit -m "CloudPress v2.0"
# GitHub push 후 Cloudflare Pages에서 연결
# Build output directory: public
```

또는 직접 배포:
```bash
wrangler pages deploy public --project-name=cloudpress
```

---

### STEP 5 — 어드민 계정 생성

1. `https://your-domain.com/auth.html` 접속
2. **회원가입** 탭에서 이메일 `choichoi3227@gmail.com` 으로 가입
3. 자동으로 `admin` 역할이 부여됩니다
4. 로그인 후 자동으로 `/admin.html` 로 이동

---

## 🔑 어드민 기능 목록

| 기능 | 설명 |
|------|------|
| 개요 | 실시간 사용자수·사이트수·매출·일간/주간/월간/연간 통계, 차트 |
| 트래픽 | 국가별·기기별 방문 통계 |
| 사용자 관리 | 전체 사용자 조회·수정·삭제, 역할/플랜 변경 |
| 사이트 관리 | 전체 사이트 조회·삭제, WP 관리자 바로 접속 |
| 공지 관리 | 공지 작성·수정·삭제·활성화, 유형 설정 |
| 매출 관리 | 결제 내역·플랜별 매출·월별 매출 |
| 설정 | 요금제 가격, 토스 키, 프로비저너 URL 설정 |

---

## 💳 토스페이먼츠 설정

1. [tosspayments.com](https://tosspayments.com) 가입 → 상점 등록
2. 테스트 키 확인: `test_ck_...` / `test_sk_...`
3. 어드민 패널 → 설정 → 토스 결제 설정에 입력
4. 실결제 시 라이브 키 `live_ck_...` / `live_sk_...` 로 교체

**지원 결제수단 (자동):** 국민, KB국민, 카카오뱅크, 토스, 우리, 신한, 삼성, 농협, 하나, 기업, SC제일, 현대, 롯데, 씨티, 우체국, 새마을, 수협, 신협, MG, 토스뱅크, 케이뱅크 + 계좌이체, 가상계좌, 휴대폰 결제

---

## ⚙️ 무료 WordPress 기술 스택

각 WordPress 사이트 개설 시 자동 설치:

| 항목 | 기술 |
|------|------|
| WordPress | 최신 버전 자동 |
| PHP | 8.3 FPM |
| 데이터베이스 | MariaDB (전용) |
| 캐시 | Redis 오브젝트 캐시 |
| 웹서버 | Apache (Docker) + Nginx 리버스 프록시 |
| SSL | Let's Encrypt 자동 발급 |
| 환경 | **Docker VPS (공유 호스팅 절대 아님)** |
| 플러그인 | LiteSpeed Cache + CloudPress Migrator 자동 설치 |

---

## 🔌 CloudPress Migrator 플러그인

WordPress 관리자 → CP Migrator 메뉴:

- **백업 생성**: 파일 + DB를 ZIP 하나로 압축 → 다운로드
- **10초 복원**: ZIP 파일 드래그&드롭 → 자동 파일+DB 복원
- **원숭이도 가능**: 드래그 → 버튼 클릭 → 끝

---

## 📞 문의

이메일: choichoi3227@gmail.com
