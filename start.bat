@echo off
chcp 65001 >nul
echo ===================================================
echo    启动 AI 热点新闻监控系统 (Backend + Frontend)
echo ===================================================
echo.

echo 正在启动后端服务 (Backend)...
start "AI Hot News - Backend" cmd /k "cd backend && npm run dev"

echo 正在启动前端页面 (Frontend)...
start "AI Hot News - Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo 所有服务已在后台新窗口中启动！
echo.
echo 后端 API 接口通常运行在: http://localhost:3001
echo 前端 监控平台通常运行在: http://localhost:5173
echo.
echo 提示：您可以随时关闭本窗口，后台的两个服务窗口会继续运行。
echo ===================================================
pause