# 중랑 정비지도 3D

실제 건물(OpenFreeMap)과 지형(AWS Terrain Tiles) 위에 중랑구 정비사업 46곳의 계획 높이를 세운 지도입니다.

## Railway에 올리기 (약 5분)
1. GitHub에서 새 저장소를 만들고(예: jungnang-3d), 이 폴더의 파일을 모두 올립니다.
   웹에서 "Add file → Upload files"로 폴더 안 파일과 vendor 폴더를 끌어다 놓으면 됩니다.
2. railway.app 로그인 → New Project → Deploy from GitHub repo → 방금 만든 저장소 선택.
3. 배포가 끝나면 서비스 → Settings → Networking → Generate Domain.
   생성된 주소(…up.railway.app)가 외부 공개 주소입니다.

## 데이터 고치기
data.js 의 D 배열만 고치면 됩니다. 저장소에 올리면 Railway가 자동으로 다시 배포합니다.
- s(상태): done 완료·공사중 / fixed 확정 / pending 미확정 / plan 계획·논의 / stalled 정체·지연 / dropped 무산·취소
- g(단계): 0 후보지 1 계획수립 2 구역지정 3 조합·시행자 4 심의·인가 5 착공 6 준공
- lat, lng: 위치(지번 기준 근사치). f: 최고층, u: 세대수, ar: 면적(㎡)
- nx, nd: 다음 계획과 시기, pb: 기부채납 시설, v: 1이면 구청 자료 확인

## 알아둘 점
- 구역 모양은 면적을 반영한 도식이며 실제 경계가 아닙니다. 구역 경계 GeoJSON을 받으면 바꿀 수 있습니다.
- 계획 높이는 최고층×3.2m, 층수가 없으면 세대수로 추정한 값입니다.
- 지도 타일을 못 불러오면 건물·지형 없이 구·동 경계와 사업 블록만 표시됩니다.
