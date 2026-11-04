#!/usr/bin/env bash
# Ma trận kiểm thử barem Security (403 / 200 / 409). Chạy trên bản đang chạy thật.
# Cần ENABLE_PASSWORD_LOGIN=true trên server.
# Dùng:  USER_PASSWORD=... ADMIN_PASSWORD=... bash scripts/check-matrix.sh [BASE_URL]
# Lưu ý: bước cuối gửi 11 request vào /status. Hạn mức là 10/phút/IP, nên nếu bạn vừa gọi
# /status trước đó, đợi 1 phút rồi chạy lại.
set -uo pipefail
BASE="${1:-http://localhost:8080}"
: "${USER_PASSWORD:?}" "${ADMIN_PASSWORD:?}"
FAIL=0

code() { curl -sS -o /dev/null -w '%{http_code}' "$@"; } # -S: lỗi của chính curl (mã 000) được in ra thay vì im lặng
expect() { # expect <mô tả> <mong đợi> <thực tế>
  if [ "$2" = "$3" ]; then echo "  [OK]   $1 -> $3"; else echo "  [FAIL] $1 -> $3 (mong đợi $2)"; FAIL=1; fi
}
token() { curl -s -X POST "$BASE/api/v1/login" -H 'Content-Type: application/json' \
  -d "{\"username\":\"$1\",\"password\":\"$2\"}" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p'; }

UT=$(token user "$USER_PASSWORD"); AT=$(token admin "$ADMIN_PASSWORD")
[ -n "$UT" ] && [ -n "$AT" ] || { echo "Không đăng nhập được, kiểm tra mật khẩu và ENABLE_PASSWORD_LOGIN"; exit 1; }
P='{"title":"Paper kiem thu","abstract":"x","tags":["test"]}'
JSON=(-H 'Content-Type: application/json')

echo "Xác thực (URL bắt buộc đăng nhập: /me)"
expect "GET /me không token" 403 "$(code "$BASE/api/v1/me")"
expect "GET /me user"        200 "$(code -H "Authorization: Bearer $UT" "$BASE/api/v1/me")"
expect "GET /me admin"       200 "$(code -H "Authorization: Bearer $AT" "$BASE/api/v1/me")"

echo "Phân quyền trên /papers"
expect "GET  /papers công khai" 200 "$(code "$BASE/api/v1/papers")"
expect "GET  /papers user"      200 "$(code -H "Authorization: Bearer $UT" "$BASE/api/v1/papers")"
expect "GET  /papers admin"     200 "$(code -H "Authorization: Bearer $AT" "$BASE/api/v1/papers")"
expect "POST /papers không token" 403 "$(code -X POST "${JSON[@]}" -d "$P" "$BASE/api/v1/papers")"
expect "POST /papers user"      403 "$(code -X POST -H "Authorization: Bearer $UT" "${JSON[@]}" -d "$P" "$BASE/api/v1/papers")"
CREATED=$(curl -s -X POST -H "Authorization: Bearer $AT" "${JSON[@]}" -d "$P" -w '\n%{http_code}' "$BASE/api/v1/papers")
expect "POST /papers admin"     201 "$(echo "$CREATED" | tail -1)"
ID=$(echo "$CREATED" | head -1 | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
[ -n "$ID" ] || { echo "  [FAIL] không đọc được id của paper vừa tạo"; FAIL=1; ID=0; }
# File tạm đặt ở thư mục hiện tại (đường dẫn tương đối): cả curl của Git Bash lẫn curl.exe của Windows đều đọc được,
# còn /tmp/... thì curl.exe không hiểu và báo mã 000.
TMPPDF=".matrix-test.$$.pdf"; trap 'rm -f "$TMPPDF"' EXIT
printf '%%PDF-1.4\n%%test\n%%%%EOF\n' > "$TMPPDF"
expect "POST file không token"  403 "$(code -X POST -F "file=@$TMPPDF;type=application/pdf" "$BASE/api/v1/papers/$ID/file")"
expect "POST file user"         403 "$(code -X POST -H "Authorization: Bearer $UT" -F "file=@$TMPPDF;type=application/pdf" "$BASE/api/v1/papers/$ID/file")"
expect "POST file admin"        200 "$(code -X POST -H "Authorization: Bearer $AT" -F "file=@$TMPPDF;type=application/pdf" "$BASE/api/v1/papers/$ID/file")"
expect "GET  file công khai"    200 "$(code "$BASE/api/v1/papers/$ID/file")"
echo "not a pdf" > "$TMPPDF"
expect "POST file giả PDF"      400 "$(code -X POST -H "Authorization: Bearer $AT" -F "file=@$TMPPDF;type=application/pdf" "$BASE/api/v1/papers/$ID/file")"
rm -f "$TMPPDF"
echo "Comment"
CM='{"body":"comment kiem thu"}'
expect "GET  comments công khai"  200 "$(code "$BASE/api/v1/papers/$ID/comments")"
expect "POST comment không token" 403 "$(code -X POST "${JSON[@]}" -d "$CM" "$BASE/api/v1/papers/$ID/comments")"
CCREATED=$(curl -s -X POST -H "Authorization: Bearer $UT" "${JSON[@]}" -d "$CM" -w '\n%{http_code}' "$BASE/api/v1/papers/$ID/comments")
expect "POST comment user"        201 "$(echo "$CCREATED" | tail -1)"
CID=$(echo "$CCREATED" | head -1 | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
PATCHB='{"body":"da sua"}'
expect "PATCH comment không token" 403 "$(code -X PATCH "${JSON[@]}" -d "$PATCHB" "$BASE/api/v1/comments/$CID")"
expect "PATCH comment admin (không phải chủ)" 403 "$(code -X PATCH -H "Authorization: Bearer $AT" "${JSON[@]}" -d "$PATCHB" "$BASE/api/v1/comments/$CID")"
expect "PATCH comment chủ" 200 "$(code -X PATCH -H "Authorization: Bearer $UT" "${JSON[@]}" -d "$PATCHB" "$BASE/api/v1/comments/$CID")"
expect "POST reply" 201 "$(code -X POST -H "Authorization: Bearer $AT" "${JSON[@]}" -d "{\"body\":\"tra loi\",\"parent_id\":$CID}" "$BASE/api/v1/papers/$ID/comments")"
echo "Tìm kiếm, tag, thống kê, lượt xem (công khai)"
expect "GET /papers?q=" 200 "$(code "$BASE/api/v1/papers?q=kiem")"
expect "GET /papers?sort sai" 400 "$(code "$BASE/api/v1/papers?sort=oops")"
expect "GET /tags" 200 "$(code "$BASE/api/v1/tags")"
expect "GET /stats" 200 "$(code "$BASE/api/v1/stats")"
expect "POST /papers/:id/view" 200 "$(code -X POST "$BASE/api/v1/papers/$ID/view")"
echo "Comment (xoá)"
expect "DELETE comment không token" 403 "$(code -X DELETE "$BASE/api/v1/comments/$CID")"
expect "DELETE comment admin"     204 "$(code -X DELETE -H "Authorization: Bearer $AT" "$BASE/api/v1/comments/$CID")"
echo "Paper"
expect "DELETE user"            403 "$(code -X DELETE -H "Authorization: Bearer $UT" "$BASE/api/v1/papers/$ID")"
expect "DELETE không token"     403 "$(code -X DELETE "$BASE/api/v1/papers/$ID")"
expect "DELETE admin"           204 "$(code -X DELETE -H "Authorization: Bearer $AT" "$BASE/api/v1/papers/$ID")"

echo "Probe / metrics"
# Khi chạy qua nginx (cụm K8s), /metrics KHÔNG được proxy ra ngoài: đặt METRICS_BASE trỏ thẳng tới api (port-forward).
# Không đặt thì dùng BASE. Kiểm cả NỘI DUNG, vì nginx trả index.html 200 cho mọi đường dẫn lạ (đạt giả nếu chỉ nhìn mã).
MB="${METRICS_BASE:-$BASE}"
expect "GET /healthz" 200 "$(code "$MB/healthz")"
expect "GET /metrics" 200 "$(code "$MB/metrics")"
if curl -sS "$MB/metrics" | grep -q '^http_requests_total'; then echo "  [OK]   /metrics có http_requests_total"; else echo "  [FAIL] /metrics không có http_requests_total (đang trỏ nhầm vào web?)"; FAIL=1; fi

echo "Rate limit /status (10 đầu 200, request 11 phải 409)"
for i in $(seq 1 10); do R=$(code "$BASE/api/v1/status"); [ "$R" = 200 ] || { echo "  [FAIL] request $i -> $R"; FAIL=1; }; done
expect "request 11" 409 "$(code "$BASE/api/v1/status")"

echo; [ "$FAIL" -eq 0 ] && echo "MA TRẬN: ĐẠT" || echo "MA TRẬN: CHƯA ĐẠT"
exit "$FAIL"
