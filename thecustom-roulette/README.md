# 더커스텀 룰렛

GitHub Pages에 바로 올릴 수 있는 정적 웹사이트입니다. 빌드 과정 없이 `index.html`을 열면 작동합니다.

## 포함 기능

- 메인 룰렛 페이지
- 뽑기 설정 페이지
- 룰렛 칸 개수 조절
- 상품명 직접 입력
- 확률 숫자 입력
- 총 확률 100% 검증
- 설정값 localStorage 저장
- 설정값 기반 가중치 랜덤 추첨
- 룰렛 회전 사운드(Web Audio API)
- 당첨 후 선물상자 오픈 연출
- 상품명은 룰렛에 표시하지 않고 `?`로 숨김
- 낮은 확률 순서대로 노랑 → 빨강 → 보라 → 남색 → 하늘색 → 초록 → 흰색 색상 자동 배정

## GitHub Pages 사용법

1. 이 폴더 안의 파일을 GitHub 저장소에 업로드합니다.
2. GitHub 저장소의 `Settings` → `Pages`로 이동합니다.
3. `Deploy from a branch`를 선택합니다.
4. 브랜치는 `main`, 폴더는 `/root`로 설정합니다.
5. 배포된 주소에서 `index.html`이 메인 페이지로 열립니다.

## 파일 구조

```text
index.html
settings.html
assets/
  styles.css
  app.js
.nojekyll
README.md
```

## 구현상 주의

사진 한 장을 배경으로 깔아둔 방식이 아니라, 룰렛/설정창/패널/상자 연출은 실제 HTML, CSS, JavaScript로 구성했습니다. 다만 생성된 목업 이미지의 실사급 배경 소품과 조명까지 DOM만으로 완벽히 동일하게 재현하는 것은 불가능하므로, 같은 구도와 분위기를 CSS 장식으로 맞춘 버전입니다.
