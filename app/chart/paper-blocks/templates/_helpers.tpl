{{/*
Tên Service CỐ ĐỊNH là "api" và "web": nginx.conf proxy tới http://api:8080 nên tên này phải đúng ở mọi
namespace. Hệ quả: mỗi namespace chỉ chạy được một release (đúng với mô hình preview: mỗi PR một namespace).
*/}}
{{- define "pb.labels" -}}
app.kubernetes.io/part-of: paper-blocks
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "pb.selector" -}}
app.kubernetes.io/name: {{ .name }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
{{- end -}}

{{/* Bộ securityContext dùng chung: không root, không leo quyền, bỏ hết capability */}}
{{- define "pb.containerSecurity" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
{{- end -}}
