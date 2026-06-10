import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { config } from '../config';

@Controller()
export class PagesController {
  constructor(private readonly auth: AuthService) {}

  @Get('/login')
  loginPage(@Req() req: Request, @Res() res: Response) {
    if (this.auth.isRequestAuthenticated(req)) {
      res.redirect('/admin');
      return;
    }

    res.type('text/html; charset=utf-8').send(`
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Đăng nhập quản trị</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: Arial, sans-serif; background: #eef2f6; color: #111827; padding: 24px; }
    .login-panel { width: min(420px, 100%); background: #fff; border: 1px solid #d8dee8; border-radius: 6px; padding: 28px; }
    h1 { margin: 0 0 22px; font-size: 22px; color: #111827; }
    .login-brand { color: #14538d; margin: 0 0 8px; line-height: 1.35; font-size: 18px; font-weight: 900; text-transform: uppercase; }
    form { display: grid; gap: 16px; }
    label { display: grid; gap: 6px; font-weight: 700; color: #334155; }
    input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 16px; }
    button { border: 0; border-radius: 5px; padding: 12px 14px; font-size: 16px; font-weight: 800; cursor: pointer; background: #087df3; color: #fff; }
    button:disabled { opacity: .6; cursor: wait; }
    .error { min-height: 22px; color: #b91c1c; font-weight: 700; }
  </style>
</head>
<body>
  <main class="login-panel">
    <p class="login-brand">Hệ thống phát thanh thông minh</p>
    <h1>Đăng nhập quản trị</h1>
    <form id="loginForm">
      <label>Tên đăng nhập
        <input id="usernameInput" type="text" autocomplete="username" autofocus required>
      </label>
      <label>Mật khẩu
        <input id="passwordInput" type="password" autocomplete="current-password" required>
      </label>
      <button id="loginBtn" type="submit">Đăng nhập</button>
      <div class="error" id="errorText"></div>
    </form>
  </main>
  <script>
    const form = document.getElementById('loginForm');
    const errorText = document.getElementById('errorText');
    const loginBtn = document.getElementById('loginBtn');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorText.innerText = '';
      loginBtn.disabled = true;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('usernameInput').value,
            password: document.getElementById('passwordInput').value,
          }),
        });
        if (!res.ok) throw new Error('Tên đăng nhập hoặc mật khẩu không đúng.');
        window.location.href = '/admin';
      } catch (error) {
        errorText.innerText = error.message || 'Không đăng nhập được.';
      } finally {
        loginBtn.disabled = false;
      }
    });
  </script>
</body>
</html>
`);
  }

  @Get('/admin')
  adminPage(@Req() req: Request, @Res() res: Response) {
    if (!this.auth.isRequestAuthenticated(req)) {
      res.redirect('/login');
      return;
    }

    res.type('text/html; charset=utf-8').send(`
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Quản trị truyền thanh xã</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #eef2f6; color: #111827; }
    .layout { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; }
    .sidebar { background: #14538d; color: #fff; padding: 20px 14px; }
    .brand { font-weight: 800; color: #fff74a; margin-bottom: 22px; line-height: 1.35; text-transform: uppercase; }
    .nav-btn { width: 100%; display: flex; align-items: center; gap: 10px; padding: 14px 16px; margin: 8px 0; border: 0; border-radius: 8px; background: transparent; color: #fff; font-size: 16px; font-weight: 700; text-align: left; cursor: pointer; }
    .nav-btn.active { background: #ff8a00; }
    .main { min-width: 0; }
    .topbar { height: 64px; display: flex; align-items: center; justify-content: space-between; background: #1d67a8; color: #fff; padding: 0 24px; border-bottom: 2px solid #d7e5f2; }
    .topbar h1 { font-size: 20px; margin: 0; }
    .topbar-actions { display: flex; align-items: center; gap: 12px; }
    .clock { background: #f2f4f7; color: #e11d48; padding: 8px 14px; font-weight: 800; border-radius: 2px; }
    .account-menu { position: relative; }
    .account-btn { background: #e8eef6; color: #1f2937; display: flex; align-items: center; gap: 8px; }
    .account-popover { position: absolute; right: 0; top: calc(100% + 8px); width: 220px; background: #fff; color: #111827; border: 1px solid #d8dee8; border-radius: 6px; box-shadow: 0 12px 28px rgba(15, 23, 42, .18); padding: 8px; display: none; z-index: 5; }
    .account-menu.open .account-popover { display: grid; gap: 6px; }
    .account-name { padding: 8px 10px; color: #64748b; font-size: 13px; font-weight: 800; overflow-wrap: anywhere; }
    .menu-item { width: 100%; text-align: left; background: transparent; color: #111827; font-weight: 700; }
    .menu-item:hover { background: #e8eef6; }
    .content { padding: 28px; }
    .panel { background: #fff; border: 1px solid #d8dee8; border-radius: 6px; overflow: hidden; }
    .panel-header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid #e5e7eb; }
    .panel-title { margin: 0; font-size: 22px; }
    .muted { color: #64748b; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1ca4b4; text-align: left; padding: 14px 12px; color: #0f172a; font-size: 15px; }
    td { padding: 13px 12px; border-top: 1px solid #e5e7eb; vertical-align: middle; }
    tr:nth-child(even) td { background: #f7f7f8; }
    button { border: 0; border-radius: 5px; padding: 10px 14px; font-size: 15px; font-weight: 700; cursor: pointer; }
    button:disabled { opacity: .55; cursor: not-allowed; }
    .primary { background: #087df3; color: #fff; }
    .success { background: #16a34a; color: #fff; }
    .danger { background: #dc3545; color: #fff; }
    .neutral { background: #7f8c8d; color: #fff; }
    .warning { background: #f59e0b; color: #111827; }
    .ghost { background: #e8eef6; color: #1f2937; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 4px 8px; border-radius: 999px; font-size: 13px; font-weight: 800; }
    .badge.ok { background: #dcfce7; color: #166534; }
    .badge.warn { background: #fef3c7; color: #92400e; }
    .badge.error { background: #fee2e2; color: #991b1b; }
    .badge.neutral-badge { background: #e8eef6; color: #334155; }
    .view { display: none; }
    .view.active { display: block; }
    .form-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    input[type="text"] { min-width: 280px; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 15px; }
    input[type="date"], input[type="time"], select { min-width: 180px; padding: 11px 12px; border: 1px solid #cbd5e1; border-radius: 5px; font-size: 15px; background: #fff; }
    input[type="file"] { padding: 8px 0; }
    label { display: grid; gap: 6px; font-weight: 700; color: #334155; }
    .inline-tools { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .inline-tools input { flex: 1; min-width: 280px; }
    .rtsp-test-status { font-weight: 800; color: #64748b; }
    .rtsp-test-status.ok { color: #15803d; }
    .rtsp-test-status.error { color: #b91c1c; }
    .status { margin-top: 18px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; color: #334155; font-weight: 700; white-space: pre-wrap; }
    .schedule-status { padding: 16px 20px; border-bottom: 1px solid #e5e7eb; background: #f8fafc; display: grid; gap: 12px; }
    .schedule-status h3 { margin: 0; font-size: 18px; }
    .schedule-status-grid { display: grid; grid-template-columns: repeat(4, minmax(140px, 1fr)); gap: 10px; }
    .schedule-status-item { display: grid; gap: 4px; }
    .schedule-status-item span { color: #64748b; font-size: 13px; font-weight: 700; }
    .schedule-status-item strong { color: #111827; font-size: 15px; overflow-wrap: anywhere; }
    .editor-grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 18px; padding: 20px; }
    .schedule-grid { display: grid; grid-template-columns: repeat(2, minmax(240px, 1fr)); gap: 16px; padding: 20px; }
    .full-row { grid-column: 1 / -1; }
    .box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; }
    .box h3 { margin-top: 0; }
    .profile-grid { display: grid; grid-template-columns: repeat(2, minmax(180px, 1fr)); gap: 16px; padding: 20px; }
    .profile-item { border: 1px solid #e5e7eb; border-radius: 6px; padding: 16px; display: grid; gap: 6px; }
    .profile-item span { color: #64748b; font-size: 13px; font-weight: 800; }
    .profile-item strong { color: #111827; font-size: 16px; overflow-wrap: anywhere; }
    .device-tools { display: grid; grid-template-columns: 1fr; gap: 18px; padding: 20px; }
    .device-subnav { display: flex; gap: 10px; flex-wrap: wrap; }
    .device-tab { background: #e8eef6; color: #1f2937; }
    .device-tab.active { background: #ff8a00; color: #fff; }
    .device-subview { display: none; }
    .device-subview.active { display: block; }
    .device-command-layout { display: grid; grid-template-columns: 300px 1fr; gap: 16px; align-items: start; }
    .device-program-list { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .device-program-list h3 { margin: 0; padding: 14px 16px; border-bottom: 1px solid #e5e7eb; }
    .device-program-option { display: flex; gap: 10px; align-items: flex-start; padding: 12px 16px; border-top: 1px solid #f1f5f9; cursor: pointer; }
    .device-program-option:first-of-type { border-top: 0; }
    .device-program-option strong { display: block; font-size: 16px; line-height: 1.35; }
    .device-command-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0 16px; flex-wrap: wrap; }
    .device-command-bar .actions { align-items: center; }
    .device-bluebar { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: #087df3; color: #fff; padding: 12px 16px; margin-bottom: 12px; flex-wrap: wrap; }
    .device-bluebar .actions button { min-width: 52px; min-height: 46px; font-size: 20px; }
    .device-stats { display: flex; align-items: center; gap: 28px; font-size: 18px; font-weight: 800; flex-wrap: wrap; }
    .device-schedule-cell { max-width: 280px; overflow-wrap: anywhere; }
    .device-select-col { width: 44px; text-align: center; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, .42); display: none; align-items: center; justify-content: center; padding: 24px; z-index: 20; }
    .modal-backdrop.open { display: flex; }
    .modal { width: min(860px, 100%); max-height: calc(100vh - 48px); overflow: auto; background: #fff; border-radius: 6px; border: 1px solid #d8dee8; }
    .modal-header { padding: 20px 24px; border-bottom: 1px solid #e5e7eb; }
    .modal-header h2 { margin: 0; font-size: 26px; }
    .modal-body { padding: 22px 24px; display: grid; gap: 16px; }
    .modal-grid { display: grid; grid-template-columns: 220px 1fr; gap: 14px; align-items: center; }
    .modal-grid label { display: block; font-size: 18px; color: #111827; }
    .modal-grid input, .modal-grid select, .modal-grid textarea { width: 100%; min-width: 0; }
    .modal-grid textarea { min-height: 180px; resize: vertical; font: inherit; }
    .modal-status { border: 1px solid #d8dee8; border-radius: 6px; padding: 12px 14px; background: #f8fafc; color: #64748b; font-weight: 700; }
    .modal-status.info { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
    .modal-status.success { background: #ecfdf5; border-color: #bbf7d0; color: #15803d; }
    .modal-status.error { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
    .modal-footer { display: flex; justify-content: center; gap: 10px; padding: 18px 24px 24px; }
    @media (max-width: 1100px) { .device-command-layout { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .sidebar { position: static; } .editor-grid { grid-template-columns: 1fr; } .modal-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="brand">Phát thanh thông minh</div>
      <button class="nav-btn" id="navSchedules" onclick="showView('schedules')">Cài đặt lịch phát</button>
      <button class="nav-btn active" id="navPlaylists" onclick="showView('playlists')">Danh sách phát</button>
      <button class="nav-btn" id="navFiles" onclick="showView('files')">Kho âm thanh</button>
      <button class="nav-btn" id="navDevices" onclick="showView('devices')">Quản lý thiết bị</button>
      <button class="nav-btn" id="navLive" onclick="showView('live')">Phát trực tiếp</button>
    </aside>

    <main class="main">
      <header class="topbar">
        <h1 id="pageTitle">Danh sách phát</h1>
        <div class="topbar-actions">
          <div class="clock" id="clock">--:--:--</div>
          <div class="account-menu" id="accountMenu">
            <button class="account-btn" onclick="toggleAccountMenu()" type="button">
              <span id="accountLabel">Admin</span>
              <span>▾</span>
            </button>
            <div class="account-popover">
              <div class="account-name" id="accountMenuName">Admin</div>
              <button class="menu-item" onclick="openProfile()" type="button">Hồ sơ</button>
              <button class="menu-item" onclick="logout()" type="button">Đăng xuất</button>
            </div>
          </div>
        </div>
      </header>

      <section class="content">
        <div id="schedulesView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Cài đặt lịch phát</h2>
                <div class="muted">Tạo lịch phát định kỳ hoặc lịch khẩn cấp theo khung giờ.</div>
              </div>
              <button class="primary" onclick="newSchedule()">Tạo lịch phát mới</button>
            </div>
            <div id="scheduleStatusPanel" class="schedule-status"></div>
            <table>
              <thead>
                <tr>
                  <th>Tên lịch</th>
                  <th>Kiểu phát</th>
                  <th>Nguồn phát</th>
                  <th>Mức ưu tiên</th>
                  <th>Thời gian</th>
                  <th>Lặp lại</th>
                  <th>Trạng thái</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody id="scheduleRows"></tbody>
            </table>
          </div>
        </div>

        <div id="scheduleEditorView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Thêm mới lịch phát</h2>
                <div class="muted">Chọn nguồn phát, mức ưu tiên và thời gian phát.</div>
              </div>
              <button class="ghost" onclick="showView('schedules')">Quay lại</button>
            </div>
            <div class="schedule-grid">
              <label class="full-row">Tên lịch phát
                <input id="scheduleNameInput" type="text" placeholder="Ví dụ: Bản tin sáng">
              </label>
              <label>Kiểu phát
                <select id="scheduleSourceInput" onchange="updateScheduleSourceFields()">
                  <option value="FILE">Phát từ file</option>
                  <option value="RTSP">Tiếp sóng URL</option>
                </select>
              </label>
              <label>Mức ưu tiên
                <select id="schedulePriorityInput">
                  <option value="NORMAL">Thường</option>
                  <option value="EMERGENCY">Khẩn cấp</option>
                </select>
              </label>
              <label class="file-schedule-field">Danh sách phát
                <select id="schedulePlaylistInput" onchange="renderScheduleFileOptions()"></select>
              </label>
              <label class="file-schedule-field">Phạm vi phát
                <select id="scheduleFileModeInput" onchange="renderScheduleFileOptions()">
                  <option value="PLAYLIST">Toàn bộ danh sách</option>
                  <option value="SINGLE_FILE">Một file trong danh sách</option>
                </select>
              </label>
              <label class="file-schedule-field full-row" id="scheduleFileField">File cần phát
                <select id="scheduleFileInput"></select>
              </label>
              <label class="rtsp-schedule-field full-row">Stream URL
                <div class="inline-tools">
                  <input id="scheduleRtspInput" type="text" placeholder="rtsp://... hoặc https://.../playlist.m3u8" oninput="resetRtspTestStatus()">
                  <button class="primary" type="button" onclick="testRtspConnection()">Kiểm tra kết nối</button>
                  <span id="rtspTestStatus" class="rtsp-test-status">Chưa kiểm tra</span>
                </div>
              </label>
              <label>Ngày bắt đầu
                <input id="scheduleStartDateInput" type="date">
              </label>
              <label>Giờ bắt đầu
                <input id="scheduleStartTimeInput" type="time">
              </label>
              <label>Giờ kết thúc
                <input id="scheduleEndTimeInput" type="time">
              </label>
              <label>Lặp lại
                <select id="scheduleRepeatInput">
                  <option value="ONCE">Không lặp</option>
                  <option value="DAILY">Hằng ngày</option>
                  <option value="WEEKLY">Hằng tuần</option>
                  <option value="MONTHLY">Hằng tháng</option>
                </select>
              </label>
              <label>Trạng thái
                <select id="scheduleEnabledInput">
                  <option value="true">Bật</option>
                  <option value="false">Tắt</option>
                </select>
              </label>
              <div class="actions full-row">
                <button class="success" onclick="saveSchedule()">Lưu lịch phát</button>
                <button class="neutral" onclick="showView('schedules')">Hủy bỏ</button>
              </div>
            </div>
          </div>
        </div>

        <div id="playlistsView" class="view active">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Danh sách phát</h2>
                <div class="muted">Quản lý nhóm file âm thanh dùng cho lịch phát.</div>
              </div>
              <button class="primary" onclick="createPlaylist()">Tạo danh sách phát mới</button>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Tên danh sách phát</th>
                  <th>Tổng số file</th>
                  <th>Tổng dung lượng</th>
                  <th>Ngày tạo</th>
                  <th>Thao tác</th>
                </tr>
              </thead>
              <tbody id="playlistRows"></tbody>
            </table>
          </div>
        </div>

        <div id="editorView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Chỉnh sửa danh sách phát</h2>
                <div class="muted">Thêm file âm thanh và sắp xếp nội dung phát.</div>
              </div>
              <button class="ghost" onclick="showView('playlists')">Quay lại</button>
            </div>
            <div class="editor-grid">
              <div class="box">
                <h3>Thông tin danh sách</h3>
                <div class="form-row">
                  <input id="playlistNameInput" type="text" placeholder="Tên danh sách phát">
                  <button class="primary" onclick="savePlaylistName()">Lưu tên</button>
                </div>
                <h3 style="margin-top:24px">File trong danh sách</h3>
                <table>
                  <thead><tr><th>STT</th><th>Tên file</th><th>Dung lượng</th><th></th></tr></thead>
                  <tbody id="playlistItemRows"></tbody>
                </table>
              </div>
              <div class="box">
                <h3>Thêm file âm thanh</h3>
                <input type="file" id="fileInput" accept=".mp3,audio/mpeg">
                <button class="success" onclick="uploadFileToPlaylist()">Tải lên và thêm vào danh sách</button>
                <button class="primary" onclick="openTtsModal(true)" type="button">Chuyển đổi giọng nói</button>
                <h3 style="margin-top:24px">Kho âm thanh</h3>
                <table>
                  <thead><tr><th>Tên file</th><th></th></tr></thead>
                  <tbody id="editorFileRows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div id="filesView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Kho âm thanh</h2>
                <div class="muted">Các file đã tải lên hệ thống.</div>
              </div>
              <button class="success" onclick="openTtsModal(false)" type="button">Chuyển đổi giọng nói</button>
            </div>
            <table>
              <thead><tr><th>Tên file</th><th>Dung lượng</th><th>Ngày tải lên</th></tr></thead>
              <tbody id="fileRows"></tbody>
            </table>
          </div>
        </div>

        <div id="liveView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Phát trực tiếp</h2>
                <div class="muted">Dùng micro để phát thông báo khẩn cấp.</div>
              </div>
            </div>
            <div style="padding:20px" class="actions">
              <button id="micBtn" class="danger" onclick="startMic()">Bật micro</button>
              <button class="neutral" onclick="stop()">Dừng phát</button>
            </div>
          </div>
        </div>

        <div id="devicesView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title" id="devicePanelTitle">Thiết bị</h2>
                <div class="muted" id="devicePanelDescription">Cấu hình vận hành cho thiết bị</div>
              </div>
              <div class="device-subnav">
                <button class="device-tab active" id="deviceTabDevices" onclick="showDeviceSubView('devices')" type="button">Thiết bị</button>
                <button class="device-tab" id="deviceTabSettings" onclick="showDeviceSubView('settings')" type="button">Cài đặt</button>
                <button class="device-tab" id="deviceTabLogs" onclick="showDeviceSubView('logs')" type="button">Nhật ký</button>
              </div>
            </div>
            <div class="device-tools">
              <div class="box device-subview active" id="deviceSubViewDevices">
                <div class="device-command-layout">
                  <div class="device-program-list">
                    <h3>Danh sách lịch phát</h3>
                    <div id="deviceProgramRows"></div>
                  </div>
                  <div>
                    <div class="device-bluebar">
                      <div class="actions">
                        <button class="primary" onclick="syncSelectedDeviceSchedules()" title="Tải lịch" type="button">⬆</button>
                        <button class="success" onclick="playSelectedDevicesNow()" title="Phát" type="button">▶</button>
                        <button class="neutral" onclick="stopSelectedDevices()" title="Dừng phát" type="button">Ⅱ</button>
                      </div>
                      <div class="device-stats">
                        <span id="deviceTotalStat">Tổng thiết bị: 0</span>
                        <span id="deviceOnlineStat">Kết nối: 0</span>
                        <span id="deviceOfflineStat">Mất kết nối: 0</span>
                      </div>
                    </div>
                    <div class="device-command-bar">
                      <strong id="deviceSelectionSummary">Chưa chọn thiết bị</strong>
                    </div>
                    <table>
                      <thead>
                        <tr>
                          <th class="device-select-col"><input id="deviceSelectAllInput" type="checkbox" onchange="toggleAllDevices(this.checked)"></th>
                          <th>Thông tin thiết bị</th>
                          <th>Trạng thái phát</th>
                          <th>Kết nối</th>
                        </tr>
                      </thead>
                      <tbody id="deviceRows"></tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div class="box device-subview" id="deviceSubViewSettings">
                <div class="form-row" style="justify-content:space-between; margin-bottom:16px">
                  <h3>Cài đặt thiết bị</h3>
                  <div class="actions">
                    <button class="primary" onclick="openDeviceCreateModal()" type="button">Thêm mới</button>
                    <button class="primary" onclick="openDeviceImportModal()" type="button">Nhập thiết bị</button>
                    <button class="primary" onclick="exportDevicesCsv()" type="button">Xuất thiết bị</button>
                  </div>
                </div>
                <input id="deviceSearchInput" type="text" placeholder="Tìm kiếm" oninput="renderDeviceSettings()" style="width:min(720px,100%); margin-bottom:16px">
                <table>
                  <thead>
                    <tr>
                      <th>Tên thiết bị</th>
                      <th>MAC</th>
                      <th>Khu vực</th>
                      <th>Dạng kết nối</th>
                      <th>Cập nhật cuối</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody id="deviceSettingRows"></tbody>
                </table>
              </div>

              <div class="box device-subview" id="deviceSubViewLogs">
                <h3>Nhật ký thiết bị</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Thiết bị</th>
                      <th>Trạng thái</th>
                      <th>Nội dung</th>
                    </tr>
                  </thead>
                  <tbody id="deviceLogRows"></tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-backdrop" id="deviceCreateModal">
          <div class="modal">
            <div class="modal-header"><h2 id="deviceCreateModalTitle">Tạo thiết bị mới</h2></div>
            <div class="modal-body">
              <div class="modal-grid">
                <label><span style="color:#e11d48">*</span> Địa chỉ MAC:</label>
                <input id="newDeviceMacInput" type="text">
                <label><span style="color:#e11d48">*</span> Tên thiết bị:</label>
                <input id="newDeviceNameInput" type="text">
                <label><span style="color:#e11d48">*</span> SIM:</label>
                <input id="newDeviceSimInput" type="text">
                <label>Khu vực:</label>
                <input id="newDeviceAreaInput" type="text">
                <label>Dạng kết nối:</label>
                <select id="newDeviceConnectionInput">
                  <option value="4G">4G</option>
                  <option value="LAN">LAN</option>
                </select>
                <label>Vĩ độ:</label>
                <input id="newDeviceLatInput" type="text">
                <label>Kinh độ:</label>
                <input id="newDeviceLngInput" type="text">
              </div>
            </div>
            <div class="modal-footer">
              <button class="primary" onclick="saveNewDeviceDemo()" type="button">Lưu</button>
              <button class="danger" onclick="closeDeviceModals()" type="button">Hủy bỏ</button>
            </div>
          </div>
        </div>

        <div class="modal-backdrop" id="deviceImportModal">
          <div class="modal">
            <div class="modal-header"><h2>Nhập file thiết bị</h2></div>
            <div class="modal-body">
              <label>Chọn file
                <input id="deviceImportFileInput" type="file" accept=".csv,.xlsx,.xls">
              </label>
            </div>
            <div class="modal-footer">
              <button class="primary" onclick="importDevicesDemo()" type="button">OK</button>
              <button class="danger" onclick="closeDeviceModals()" type="button">Hủy bỏ</button>
            </div>
          </div>
        </div>

        <div class="modal-backdrop" id="ttsModal">
          <div class="modal">
            <div class="modal-header"><h2>Chuyển đổi giọng nói</h2></div>
            <div class="modal-body">
              <div class="modal-grid">
                <label>Tiêu đề file:</label>
                <input id="ttsTitleInput" type="text" placeholder="Ví dụ: Thông báo khẩn cấp">
                <label>Giọng đọc:</label>
                <select id="ttsVoiceInput"></select>
                <label>Tốc độ:</label>
                <select id="ttsSpeedInput">
                  <option value="-2">Chậm hơn</option>
                  <option value="-1">Hơi chậm</option>
                  <option value="0" selected>Bình thường</option>
                  <option value="+1">Hơi nhanh</option>
                  <option value="+2">Nhanh hơn</option>
                </select>
                <label>Nội dung:</label>
                <textarea id="ttsTextInput" maxlength="5000" placeholder="Nhập nội dung cần chuyển thành giọng nói..."></textarea>
              </div>
              <div class="modal-status" id="ttsHint">FPT.AI giới hạn tối đa 5000 ký tự mỗi lần tạo.</div>
            </div>
            <div class="modal-footer">
              <button class="primary" id="ttsGenerateButton" onclick="generateTtsAudio()" type="button">Tạo âm thanh</button>
              <button class="danger" id="ttsCancelButton" onclick="closeDeviceModals()" type="button">Hủy bỏ</button>
            </div>
          </div>
        </div>

        <div id="profileView" class="view">
          <div class="panel">
            <div class="panel-header">
              <div>
                <h2 class="panel-title">Hồ sơ tài khoản</h2>
                <div class="muted">Thông tin phiên đăng nhập hiện tại.</div>
              </div>
            </div>
            <div class="profile-grid">
              <div class="profile-item">
                <span>Tên đăng nhập</span>
                <strong id="profileUsername">Admin</strong>
              </div>
              <div class="profile-item">
                <span>Hạn phiên đăng nhập</span>
                <strong id="profileExpiresAt">--</strong>
              </div>
              <div class="profile-item full-row">
                <span>Đổi mật khẩu</span>
                <strong>Mật khẩu được cấu hình bằng ADMIN_PASSWORD trên server.</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="status" id="status">Trạng thái: Sẵn sàng</div>
      </section>
    </main>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    const state = { playlists: [], files: [], schedules: [], devices: [], ttsVoices: [], ttsAttachToPlaylist: false, selectedDeviceIds: new Set(), selectedDeviceScheduleId: '', editingDeviceId: null, selectedPlaylist: null, selectedSchedule: null, scheduleStatus: { activeSchedule: null, pausedSchedule: null }, auth: { username: 'Admin', expiresAt: null } };
    const statusEl = document.getElementById('status');
    const micBtn = document.getElementById('micBtn');
    let mediaRecorder = null;
    let micStream = null;
    let rtspTestState = 'untested';
    let rtspTestedUrl = '';

    function setStatus(message) { statusEl.innerText = 'Trạng thái: ' + message; }
    function formatBytes(bytes) {
      if (!bytes) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let index = 0;
      while (value >= 1024 && index < units.length - 1) { value /= 1024; index += 1; }
      return value.toFixed(index === 0 ? 0 : 1) + ' ' + units[index];
    }
    function formatDate(value) { return new Date(value).toLocaleString('vi-VN'); }
    function escapeHtml(value) {
      return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
    }

    function showView(name) {
      for (const el of document.querySelectorAll('.view')) el.classList.remove('active');
      for (const el of document.querySelectorAll('.nav-btn')) el.classList.remove('active');
      closeAccountMenu();
      const titles = { schedules: 'Cài đặt lịch phát', scheduleEditor: 'Thêm mới lịch phát', playlists: 'Danh sách phát', files: 'Kho âm thanh', devices: 'Quản lý thiết bị', live: 'Phát trực tiếp', editor: 'Chỉnh sửa danh sách phát', profile: 'Hồ sơ tài khoản' };
      document.getElementById('pageTitle').innerText = titles[name] || 'Danh sách phát';
      if (name === 'schedules') { document.getElementById('schedulesView').classList.add('active'); document.getElementById('navSchedules').classList.add('active'); loadSchedulePage(); }
      if (name === 'scheduleEditor') { document.getElementById('scheduleEditorView').classList.add('active'); document.getElementById('navSchedules').classList.add('active'); }
      if (name === 'playlists') { document.getElementById('playlistsView').classList.add('active'); document.getElementById('navPlaylists').classList.add('active'); loadPlaylists(); }
      if (name === 'files') { document.getElementById('filesView').classList.add('active'); document.getElementById('navFiles').classList.add('active'); loadFiles(); }
      if (name === 'devices') { document.getElementById('devicesView').classList.add('active'); document.getElementById('navDevices').classList.add('active'); loadDevicePage(); }
      if (name === 'live') { document.getElementById('liveView').classList.add('active'); document.getElementById('navLive').classList.add('active'); }
      if (name === 'editor') { document.getElementById('editorView').classList.add('active'); document.getElementById('navPlaylists').classList.add('active'); }
      if (name === 'profile') { document.getElementById('profileView').classList.add('active'); renderProfile(); }
    }

    async function api(path, options) {
      const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json', ...(options && options.headers ? options.headers : {}) },
        ...options,
      });
      if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('Vui lòng đăng nhập.');
      }
      if (!res.ok) throw new Error((await res.text()) || 'Không gọi được máy chủ.');
      return res.json();
    }

    async function logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login';
      }
    }

    function toggleAccountMenu() {
      document.getElementById('accountMenu').classList.toggle('open');
    }

    function closeAccountMenu() {
      const menu = document.getElementById('accountMenu');
      if (menu) menu.classList.remove('open');
    }

    function openProfile() {
      showView('profile');
    }

    function renderProfile() {
      document.getElementById('profileUsername').innerText = state.auth.username || 'Admin';
      document.getElementById('profileExpiresAt').innerText = state.auth.expiresAt ? formatDate(state.auth.expiresAt) : '--';
    }

    async function loadAuthProfile() {
      const data = await api('/api/auth/me');
      if (!data.authenticated) {
        window.location.href = '/login';
        return;
      }
      state.auth = {
        username: data.username || 'Admin',
        expiresAt: data.expiresAt || null,
      };
      document.getElementById('accountLabel').innerText = state.auth.username;
      document.getElementById('accountMenuName').innerText = state.auth.username;
      renderProfile();
    }

    document.addEventListener('click', (event) => {
      const menu = document.getElementById('accountMenu');
      if (menu && !menu.contains(event.target)) closeAccountMenu();
    });

    async function loadPlaylists() {
      const data = await api('/api/playlists');
      state.playlists = data.playlists || [];
      renderPlaylists();
      renderSchedulePlaylistOptions();
    }

    async function loadFiles() {
      const data = await api('/api/files');
      state.files = data.files || [];
      renderFiles();
      renderEditorFiles();
    }

    async function loadTtsVoices() {
      if (state.ttsVoices.length > 0) return;
      const data = await api('/api/tts/voices');
      state.ttsVoices = data.voices || [];
      const voiceSelect = document.getElementById('ttsVoiceInput');
      if (voiceSelect) {
        voiceSelect.innerHTML = state.ttsVoices.map((voice) => \`
          <option value="\${voice.code}" \${voice.code === data.defaultVoice ? 'selected' : ''}>\${escapeHtml(voice.label)}</option>
        \`).join('');
      }
      const speedSelect = document.getElementById('ttsSpeedInput');
      if (speedSelect) speedSelect.value = data.defaultSpeed || '0';
    }

    async function loadSchedules() {
      const data = await api('/api/schedules');
      state.schedules = data.schedules || [];
      renderSchedules();
    }

    async function loadSchedulePage() {
      await loadPlaylists();
      await loadSchedules();
    }

    async function loadDevicePage() {
      await loadSchedules();
      await loadDevices();
    }

    async function loadDevices() {
      const data = await api('/api/devices');
      state.devices = data.devices || [];
      renderDevices();
    }

    function getRepeatLabel(value) {
      return ({ ONCE: 'Không lặp', DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần', MONTHLY: 'Hằng tháng' }[value] || value);
    }

    function getDeviceDownloadableSchedules() {
      return state.schedules.filter((schedule) => schedule.sourceType === 'RTSP');
    }

    function getDeviceSyncLabel(value) {
      return ({ PENDING: 'Chưa đồng bộ', SYNCED: 'Đã đồng bộ', FAILED: 'Lỗi đồng bộ' }[value] || 'Chưa có lịch');
    }

    function getDeviceSyncBadgeClass(value) {
      return value === 'SYNCED' ? 'ok' : value === 'FAILED' ? 'error' : value === 'PENDING' ? 'warn' : 'neutral-badge';
    }

    function getDevicePlayLabel(value) {
      return ({ PLAYING: 'Đang phát', STOPPED: 'Đang dừng', IDLE: 'Không phát' }[value] || 'Không phát');
    }

    function getDevicePlayBadgeClass(value) {
      return value === 'PLAYING' ? 'ok' : value === 'STOPPED' ? 'warn' : 'neutral-badge';
    }

    function renderDevices() {
      const rows = document.getElementById('deviceRows');
      if (!rows) return;
      renderDevicePrograms();
      renderDeviceSettings();
      renderDeviceLogs();
      renderDeviceStats();
      state.selectedDeviceIds = new Set([...state.selectedDeviceIds].filter((deviceId) => state.devices.some((device) => device.deviceId === deviceId)));
      if (state.devices.length === 0) {
        rows.innerHTML = '<tr><td colspan="4" class="muted">Chưa có thiết bị demo. Hãy chạy SQL cập nhật trong supabase.sql.</td></tr>';
        updateDeviceSelectionSummary();
        return;
      }

      rows.innerHTML = state.devices.map((device) => {
        return \`
          <tr>
            <td class="device-select-col"><input type="checkbox" class="device-select-input" value="\${device.deviceId}" \${state.selectedDeviceIds.has(device.deviceId) ? 'checked' : ''} onchange="toggleDeviceSelected('\${device.deviceId}', this.checked)"></td>
            <td><strong>\${escapeHtml(device.name)}</strong><div class="muted">\${device.currentSchedule ? 'Đang phát: ' + escapeHtml(device.currentSchedule.name) : 'Không có chương trình phát'}</div></td>
            <td><span class="badge \${getDevicePlayBadgeClass(device.playStatus)}">\${getDevicePlayLabel(device.playStatus)}</span><div class="muted">\${device.currentSchedule ? escapeHtml(device.currentSchedule.name) : ''}</div></td>
            <td><span class="badge \${device.online ? 'ok' : 'error'}">\${device.online ? 'Kết nối' : 'Mất kết nối'}</span></td>
          </tr>
        \`;
      }).join('');
      updateDeviceSelectionSummary();
    }

    function renderDeviceStats() {
      const total = state.devices.length;
      const online = state.devices.filter((device) => device.online).length;
      const offline = total - online;
      const totalEl = document.getElementById('deviceTotalStat');
      const onlineEl = document.getElementById('deviceOnlineStat');
      const offlineEl = document.getElementById('deviceOfflineStat');
      if (totalEl) totalEl.innerText = 'Tổng thiết bị: ' + total;
      if (onlineEl) onlineEl.innerText = 'Kết nối: ' + online;
      if (offlineEl) offlineEl.innerText = 'Mất kết nối: ' + offline;
    }

    function renderDevicePrograms() {
      const rows = document.getElementById('deviceProgramRows');
      if (!rows) return;
      const schedules = getDeviceDownloadableSchedules();
      if (!state.selectedDeviceScheduleId && schedules[0]) state.selectedDeviceScheduleId = schedules[0].scheduleId;
      if (schedules.length === 0) {
        rows.innerHTML = '<div class="muted" style="padding:14px 16px">Chưa có lịch phát kiểu Tiếp sóng URL. Hãy tạo lịch RTSP/HTTP trong Cài đặt lịch phát.</div>';
        return;
      }

      rows.innerHTML = schedules.map((schedule) => \`
        <label class="device-program-option">
          <input type="radio" name="deviceProgram" value="\${schedule.scheduleId}" \${state.selectedDeviceScheduleId === schedule.scheduleId ? 'checked' : ''} onchange="selectDeviceSchedule('\${schedule.scheduleId}')">
          <span>
            <strong>\${escapeHtml(schedule.name)}</strong>
            <span class="muted">\${escapeHtml(schedule.startDate)} · \${escapeHtml(schedule.startTime)}-\${escapeHtml(schedule.endTime)}</span>
          </span>
        </label>
      \`).join('');
    }

    function selectDeviceSchedule(scheduleId) {
      state.selectedDeviceScheduleId = scheduleId;
      renderDevicePrograms();
    }

    function toggleDeviceSelected(deviceId, selected) {
      if (selected) state.selectedDeviceIds.add(deviceId);
      else state.selectedDeviceIds.delete(deviceId);
      updateDeviceSelectionSummary();
    }

    function toggleAllDevices(selected) {
      state.selectedDeviceIds = selected ? new Set(state.devices.map((device) => device.deviceId)) : new Set();
      renderDevices();
    }

    function getSelectedDevices() {
      return state.devices.filter((device) => state.selectedDeviceIds.has(device.deviceId));
    }

    function updateDeviceSelectionSummary() {
      const summary = document.getElementById('deviceSelectionSummary');
      if (summary) summary.innerText = state.selectedDeviceIds.size ? 'Đã chọn ' + state.selectedDeviceIds.size + ' thiết bị' : 'Chưa chọn thiết bị';
      const selectAll = document.getElementById('deviceSelectAllInput');
      if (selectAll) selectAll.checked = state.devices.length > 0 && state.selectedDeviceIds.size === state.devices.length;
    }

    function showDeviceSubView(name) {
      for (const el of document.querySelectorAll('.device-subview')) el.classList.remove('active');
      for (const el of document.querySelectorAll('.device-tab')) el.classList.remove('active');
      const view = document.getElementById('deviceSubView' + name.charAt(0).toUpperCase() + name.slice(1));
      const tab = document.getElementById('deviceTab' + name.charAt(0).toUpperCase() + name.slice(1));
      const labels = {
        devices: { title: 'Thiết bị', description: 'Cấu hình vận hành cho thiết bị' },
        settings: { title: 'Cài đặt', description: 'Thêm mới, nhập, xuất và quản trị thông tin thiết bị' },
        logs: { title: 'Nhật ký', description: 'Theo dõi thao tác tải lịch, phát/dừng phát và trạng thái thiết bị' },
      };
      const label = labels[name] || labels.devices;
      const title = document.getElementById('devicePanelTitle');
      const description = document.getElementById('devicePanelDescription');
      if (title) title.innerText = label.title;
      if (description) description.innerText = label.description;
      if (view) view.classList.add('active');
      if (tab) tab.classList.add('active');
    }

    function renderDeviceSettings() {
      const rows = document.getElementById('deviceSettingRows');
      if (!rows) return;
      const searchInput = document.getElementById('deviceSearchInput');
      const keyword = searchInput ? searchInput.value.trim().toLowerCase() : '';
      const devices = keyword
        ? state.devices.filter((device) => [device.name, device.macAddress, device.area, device.connectionType].some((value) => String(value || '').toLowerCase().includes(keyword)))
        : state.devices;
      rows.innerHTML = devices.length ? devices.map((device) => \`
        <tr>
          <td><strong>\${escapeHtml(device.name)}</strong></td>
          <td>\${escapeHtml(device.macAddress)}</td>
          <td>\${escapeHtml(device.area)}</td>
          <td>\${escapeHtml(device.connectionType)}</td>
          <td>\${formatDate(device.updatedAt)}</td>
          <td class="actions">
            <button class="primary" onclick="editDeviceDemo('\${device.deviceId}')">Chỉnh sửa</button>
            <button class="danger" onclick="deleteDeviceDemo('\${device.deviceId}')">Xóa</button>
            <button class="ghost" onclick="openDeviceScheduleSetup('\${device.deviceId}')">Lịch phát luồng</button>
          </td>
        </tr>
      \`).join('') : '<tr><td colspan="6" class="muted">Không có thiết bị phù hợp.</td></tr>';
    }

    function openDeviceCreateModal() {
      state.editingDeviceId = null;
      document.getElementById('newDeviceMacInput').value = '';
      document.getElementById('newDeviceNameInput').value = '';
      document.getElementById('newDeviceSimInput').value = '';
      document.getElementById('newDeviceAreaInput').value = '';
      document.getElementById('newDeviceConnectionInput').value = '4G';
      document.getElementById('newDeviceLatInput').value = '';
      document.getElementById('newDeviceLngInput').value = '';
      document.getElementById('deviceCreateModalTitle').innerText = 'Tạo thiết bị mới';
      document.getElementById('deviceCreateModal').classList.add('open');
      document.getElementById('newDeviceMacInput').focus();
    }

    function editDeviceDemo(deviceId) {
      const device = state.devices.find((item) => item.deviceId === deviceId);
      if (!device) return;
      state.editingDeviceId = deviceId;
      document.getElementById('newDeviceMacInput').value = device.macAddress;
      document.getElementById('newDeviceNameInput').value = device.name;
      document.getElementById('newDeviceSimInput').value = '1';
      document.getElementById('newDeviceAreaInput').value = device.area;
      document.getElementById('newDeviceConnectionInput').value = device.connectionType;
      document.getElementById('newDeviceLatInput').value = '';
      document.getElementById('newDeviceLngInput').value = '';
      document.getElementById('deviceCreateModalTitle').innerText = 'Chỉnh sửa thiết bị';
      document.getElementById('deviceCreateModal').classList.add('open');
    }

    async function deleteDeviceDemo(deviceId) {
      const device = state.devices.find((item) => item.deviceId === deviceId);
      if (!device || !confirm('Xóa thiết bị ' + device.name + '?')) return;
      try {
        await api('/api/devices/' + deviceId, { method: 'DELETE' });
        state.selectedDeviceIds.delete(deviceId);
        await loadDevices();
        setStatus('Đã xóa mềm thiết bị ' + device.name + '.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    function openDeviceScheduleSetup(deviceId) {
      state.selectedDeviceIds = new Set([deviceId]);
      showDeviceSubView('devices');
      renderDevices();
      setStatus('Đã chọn thiết bị. Hãy chọn lịch phát bên trái rồi bấm Tải lịch hoặc Phát.');
    }

    function openDeviceImportModal() {
      document.getElementById('deviceImportModal').classList.add('open');
    }

    function closeDeviceModals() {
      for (const modal of document.querySelectorAll('.modal-backdrop')) modal.classList.remove('open');
      state.editingDeviceId = null;
    }

    async function openTtsModal(attachToPlaylist) {
      state.ttsAttachToPlaylist = Boolean(attachToPlaylist);
      await loadTtsVoices();
      document.getElementById('ttsTitleInput').value = '';
      document.getElementById('ttsTextInput').value = '';
      setTtsBusy(false);
      setTtsModalStatus(
        state.ttsAttachToPlaylist
          ? 'Tạo xong sẽ lưu vào Kho âm thanh và thêm vào danh sách phát hiện tại.'
          : 'Tạo xong sẽ lưu file MP3 vào Kho âm thanh.',
      );
      document.getElementById('ttsModal').classList.add('open');
      document.getElementById('ttsTextInput').focus();
    }

    function setTtsModalStatus(message, type) {
      const hint = document.getElementById('ttsHint');
      if (!hint) return;
      hint.classList.remove('info', 'success', 'error');
      if (type) hint.classList.add(type);
      hint.innerText = message;
    }

    function setTtsBusy(isBusy) {
      const generateButton = document.getElementById('ttsGenerateButton');
      const cancelButton = document.getElementById('ttsCancelButton');
      if (generateButton) {
        generateButton.disabled = Boolean(isBusy);
        generateButton.innerText = isBusy ? 'Đang tạo...' : 'Tạo âm thanh';
      }
      if (cancelButton) cancelButton.disabled = Boolean(isBusy);
    }

    async function generateTtsAudio() {
      const title = document.getElementById('ttsTitleInput').value.trim();
      const text = document.getElementById('ttsTextInput').value.trim();
      const voice = document.getElementById('ttsVoiceInput').value;
      const speed = document.getElementById('ttsSpeedInput').value;
      if (!text || text.length < 3) return alert('Vui lòng nhập nội dung cần đọc, tối thiểu 3 ký tự.');
      if (text.length > 5000) return alert('FPT.AI giới hạn tối đa 5000 ký tự mỗi lần tạo.');

      try {
        setTtsBusy(true);
        setTtsModalStatus('Đang gửi nội dung lên FPT.AI...', 'info');
        setStatus('Đang tạo file giọng nói từ FPT.AI...');
        setTimeout(() => {
          const generateButton = document.getElementById('ttsGenerateButton');
          if (generateButton && generateButton.disabled) {
            setTtsModalStatus('FPT.AI đang tạo file âm thanh, vui lòng chờ. Quá trình này có thể mất 5 giây đến 2 phút.', 'info');
          }
        }, 1200);
        const data = await api('/api/tts/generate', {
          method: 'POST',
          body: JSON.stringify({ title, text, voice, speed }),
        });
        setTtsModalStatus('Đã tạo file MP3 thành công.', 'success');
        closeDeviceModals();
        await loadFiles();
        if (state.ttsAttachToPlaylist && state.selectedPlaylist && data.file?.fileId) {
          await addFileToPlaylist(data.file.fileId);
        }
        setStatus('Đã tạo file giọng nói và lưu vào Kho âm thanh.');
      } catch (error) {
        setTtsBusy(false);
        setTtsModalStatus(error.message, 'error');
        setStatus(error.message);
      }
    }

    async function saveNewDeviceDemo() {
      const mac = document.getElementById('newDeviceMacInput').value.trim();
      const name = document.getElementById('newDeviceNameInput').value.trim();
      const sim = document.getElementById('newDeviceSimInput').value.trim();
      const area = document.getElementById('newDeviceAreaInput').value.trim();
      const connectionType = document.getElementById('newDeviceConnectionInput').value;
      if (!mac || !name || !sim) return alert('Vui lòng nhập Địa chỉ MAC, Tên thiết bị và SIM.');
      const body = JSON.stringify({ macAddress: mac, name, area, connectionType });
      const isEditing = Boolean(state.editingDeviceId);
      try {
        await api(isEditing ? '/api/devices/' + state.editingDeviceId : '/api/devices', {
          method: isEditing ? 'PUT' : 'POST',
          body,
        });
        closeDeviceModals();
        state.editingDeviceId = null;
        await loadDevices();
        setStatus(isEditing ? 'Đã cập nhật thiết bị.' : 'Đã thêm thiết bị mới.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    function importDevicesDemo() {
      const input = document.getElementById('deviceImportFileInput');
      if (!input.files || input.files.length === 0) return alert('Vui lòng chọn file thiết bị.');
      closeDeviceModals();
      setStatus('Đã nhận file ' + input.files[0].name + ' để nhập thiết bị demo.');
      input.value = '';
    }

    function exportDevicesCsv() {
      const header = ['Ten thiet bi', 'MAC', 'Khu vuc', 'Dang ket noi', 'Ket noi', 'Trang thai phat', 'Lich da tai', 'Dong bo'];
      const lines = state.devices.map((device) => [
        device.name,
        device.macAddress,
        device.area,
        device.connectionType,
        device.online ? 'Ket noi' : 'Mat ket noi',
        getDevicePlayLabel(device.playStatus),
        device.activeSchedule ? device.activeSchedule.name : '',
        getDeviceSyncLabel(device.syncStatus),
      ]);
      const csv = [header, ...lines].map((row) => row.map((cell) => '"' + String(cell || '').replace(/"/g, '""') + '"').join(',')).join('\\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'devices.csv';
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus('Đã xuất danh sách thiết bị.');
    }

    function renderDeviceLogs() {
      const rows = document.getElementById('deviceLogRows');
      if (!rows) return;
      const logs = state.devices
        .filter((device) => device.syncStatus || device.lastSyncedAt || device.syncMessage)
        .map((device) => ({
          time: device.lastSyncedAt || device.updatedAt,
          name: device.name,
          status: getDeviceSyncLabel(device.syncStatus),
          message: (device.syncMessage || (device.activeSchedule ? 'Tải lịch phát [' + device.activeSchedule.name + ']' : 'Cập nhật thiết bị')) + ' · ' + getDevicePlayLabel(device.playStatus),
        }));

      if (logs.length === 0) {
        rows.innerHTML = '<tr><td colspan="4" class="muted">Chưa có nhật ký thiết bị.</td></tr>';
        return;
      }

      rows.innerHTML = logs.map((log, index) => \`
        <tr>
          <td>\${index + 1}. \${formatDate(log.time)}</td>
          <td>\${escapeHtml(log.name)}</td>
          <td>\${escapeHtml(log.status)}</td>
          <td>\${escapeHtml(log.message)}</td>
        </tr>
      \`).join('');
    }

    async function playSelectedDevicesNow() {
      const devices = getSelectedDevices();
      if (devices.length === 0) return alert('Vui lòng chọn ít nhất một thiết bị.');
      if (!state.selectedDeviceScheduleId) return alert('Vui lòng chọn một lịch phát.');

      try {
        for (const device of devices) {
          await api('/api/devices/' + device.deviceId + '/play-now', { method: 'POST', body: JSON.stringify({ scheduleId: state.selectedDeviceScheduleId }) });
        }
        await loadDevices();
        setStatus('Đã gửi lệnh phát demo tới ' + devices.length + ' thiết bị.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    async function syncSelectedDeviceSchedules() {
      const devices = getSelectedDevices();
      if (devices.length === 0) return alert('Vui lòng chọn ít nhất một thiết bị.');
      if (!state.selectedDeviceScheduleId) return alert('Vui lòng chọn một lịch phát.');

      try {
        for (const device of devices) {
          await api('/api/devices/' + device.deviceId + '/sync-schedule', { method: 'POST', body: JSON.stringify({ scheduleId: state.selectedDeviceScheduleId }) });
        }
        await loadDevices();
        setStatus('Đã tải lịch phát xuống ' + devices.length + ' thiết bị demo.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    async function stopSelectedDevices() {
      const devices = getSelectedDevices();
      if (devices.length === 0) return alert('Vui lòng chọn ít nhất một thiết bị.');
      try {
        for (const device of devices) {
          await api('/api/devices/' + device.deviceId + '/stop', { method: 'POST' });
        }
        await loadDevices();
        setStatus('Đã gửi lệnh dừng phát demo tới ' + devices.length + ' thiết bị.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    function showDeviceDetail(deviceId) {
      const device = state.devices.find((item) => item.deviceId === deviceId);
      if (!device) return;
      const schedule = device.activeSchedule;
      alert([
        'Thiết bị: ' + device.name,
        'MAC: ' + device.macAddress,
        'Khu vực: ' + device.area,
        'Dạng kết nối: ' + device.connectionType,
        'Kết nối: ' + (device.online ? 'Kết nối' : 'Mất kết nối'),
        'Lịch phát đã tải: ' + (schedule ? schedule.name : 'Chưa chọn lịch'),
        'Trạng thái phát: ' + getDevicePlayLabel(device.playStatus),
        'Đồng bộ: ' + getDeviceSyncLabel(device.syncStatus),
      ].join('\\n'));
    }

    function renderPlaylists() {
      const rows = document.getElementById('playlistRows');
      if (state.playlists.length === 0) {
        rows.innerHTML = '<tr><td colspan="5" class="muted">Chưa có danh sách phát. Hãy tạo danh sách phát mới.</td></tr>';
        return;
      }
      rows.innerHTML = state.playlists.map((playlist) => \`
        <tr>
          <td><strong>\${escapeHtml(playlist.name)}</strong></td>
          <td>\${playlist.totalFiles}</td>
          <td>\${formatBytes(playlist.totalSize)}</td>
          <td>\${formatDate(playlist.createdAt)}</td>
          <td class="actions">
            <button class="primary" onclick="openPlaylist('\${playlist.playlistId}')">Chỉnh sửa</button>
            <button class="danger" onclick="deletePlaylist('\${playlist.playlistId}')">Xóa</button>
          </td>
        </tr>
      \`).join('');
    }

    function renderFiles() {
      const rows = document.getElementById('fileRows');
      rows.innerHTML = state.files.length ? state.files.map((file) => \`
        <tr><td>\${escapeHtml(file.originalName)}</td><td>\${formatBytes(file.size)}</td><td>\${formatDate(file.createdAt)}</td></tr>
      \`).join('') : '<tr><td colspan="3" class="muted">Chưa có file âm thanh.</td></tr>';
    }

    function renderEditorFiles() {
      const rows = document.getElementById('editorFileRows');
      rows.innerHTML = state.files.length ? state.files.map((file) => \`
        <tr><td>\${escapeHtml(file.originalName)}</td><td><button class="ghost" onclick="addFileToPlaylist('\${file.fileId}')">Thêm</button></td></tr>
      \`).join('') : '<tr><td colspan="2" class="muted">Chưa có file âm thanh.</td></tr>';
    }

    function renderSchedules() {
      renderScheduleStatus();
      const rows = document.getElementById('scheduleRows');
      if (state.schedules.length === 0) {
        rows.innerHTML = '<tr><td colspan="8" class="muted">Chưa có lịch phát. Hãy tạo lịch phát mới.</td></tr>';
        return;
      }

      rows.innerHTML = state.schedules.map((schedule) => \`
        <tr>
          <td><strong>\${escapeHtml(schedule.name)}</strong></td>
          <td>\${schedule.sourceType === 'FILE' ? 'Phát từ file' : 'Tiếp sóng URL'}</td>
          <td>\${escapeHtml(getScheduleSourceLabel(schedule))}</td>
          <td>\${schedule.priority === 'EMERGENCY' ? 'Khẩn cấp' : 'Thường'}</td>
          <td>\${escapeHtml(schedule.startDate)} · \${escapeHtml(schedule.startTime)}-\${escapeHtml(schedule.endTime)}</td>
          <td>\${getRepeatLabel(schedule.repeatType)}</td>
          <td>\${schedule.enabled ? 'Đang bật' : 'Đang tắt'}</td>
          <td class="actions">
            <button class="primary" onclick="editSchedule('\${schedule.scheduleId}')">Chỉnh sửa</button>
            <button class="danger" onclick="deleteSchedule('\${schedule.scheduleId}')">Xóa</button>
          </td>
        </tr>
      \`).join('');
    }

    function renderScheduleStatus() {
      const panel = document.getElementById('scheduleStatusPanel');
      if (!panel) return;
      const active = state.scheduleStatus.activeSchedule;
      const paused = state.scheduleStatus.pausedSchedule;
      const display = active || paused;

      if (!display) {
        panel.innerHTML = '<h3>Lịch đang phát</h3><div class="muted">Chưa có lịch nào đang phát hoặc tạm dừng.</div>';
        return;
      }

      const statusLabel = active ? 'Đang phát' : 'Đang tạm dừng';
      panel.innerHTML = \`
        <div class="form-row" style="justify-content:space-between">
          <h3>Lịch đang phát</h3>
          <div class="actions">
            <button class="neutral" onclick="pauseSchedule()" \${active ? '' : 'disabled'}>Dừng phát</button>
            <button class="success" onclick="resumeSchedule()" \${paused && !active ? '' : 'disabled'}>Phát tiếp</button>
          </div>
        </div>
        <div class="schedule-status-grid">
          <div class="schedule-status-item"><span>Trạng thái</span><strong>\${statusLabel}</strong></div>
          <div class="schedule-status-item"><span>Tên lịch</span><strong>\${escapeHtml(display.name)}</strong></div>
          <div class="schedule-status-item"><span>Kiểu phát</span><strong>\${display.sourceType === 'FILE' ? 'Phát từ file' : 'Tiếp sóng URL'}</strong></div>
          <div class="schedule-status-item"><span>Mức ưu tiên</span><strong>\${display.priority === 'EMERGENCY' ? 'Khẩn cấp' : 'Thường'}</strong></div>
          <div class="schedule-status-item full-row"><span>Thời gian</span><strong>\${escapeHtml(display.startDate)} · \${escapeHtml(display.startTime)}-\${escapeHtml(display.endTime)}</strong></div>
        </div>
        \${active && paused ? '<div class="muted">Có một lịch khác đang tạm dừng. Nút phát tiếp sẽ khả dụng khi lịch hiện tại dừng.</div>' : ''}
      \`;
    }

    function getScheduleSourceLabel(schedule) {
      if (schedule.sourceType === 'RTSP') return schedule.rtspUrl || 'Stream URL';
      const playlist = state.playlists.find((item) => item.playlistId === schedule.playlistId);
      if (schedule.fileMode === 'SINGLE_FILE') {
        const item = playlist && playlist.items.find((entry) => entry.fileId === schedule.fileId);
        return item ? item.file.originalName : 'Một file trong danh sách';
      }
      return playlist ? playlist.name : 'Toàn bộ danh sách';
    }

    function renderSchedulePlaylistOptions() {
      const select = document.getElementById('schedulePlaylistInput');
      if (!select) return;
      select.innerHTML = state.playlists.map((playlist) => \`
        <option value="\${playlist.playlistId}">\${escapeHtml(playlist.name)}</option>
      \`).join('');
      renderScheduleFileOptions();
    }

    function renderScheduleFileOptions() {
      const playlistId = document.getElementById('schedulePlaylistInput').value;
      const fileMode = document.getElementById('scheduleFileModeInput').value;
      const fileField = document.getElementById('scheduleFileField');
      const fileSelect = document.getElementById('scheduleFileInput');
      const playlist = state.playlists.find((item) => item.playlistId === playlistId);

      fileField.style.display = fileMode === 'SINGLE_FILE' ? 'grid' : 'none';
      fileSelect.innerHTML = playlist && playlist.items.length ? playlist.items.map((item) => \`
        <option value="\${item.fileId}">\${escapeHtml(item.file.originalName)}</option>
      \`).join('') : '<option value="">Chưa có file trong danh sách</option>';
    }

    function updateScheduleSourceFields() {
      const sourceType = document.getElementById('scheduleSourceInput').value;
      for (const el of document.querySelectorAll('.file-schedule-field')) el.style.display = sourceType === 'FILE' ? 'grid' : 'none';
      for (const el of document.querySelectorAll('.rtsp-schedule-field')) el.style.display = sourceType === 'RTSP' ? 'grid' : 'none';
      renderScheduleFileOptions();
    }

    function setRtspTestStatus(state, message) {
      rtspTestState = state;
      const el = document.getElementById('rtspTestStatus');
      if (!el) return;
      el.classList.remove('ok', 'error');
      if (state === 'ok') el.classList.add('ok');
      if (state === 'error') el.classList.add('error');
      el.innerText = message;
    }

    function resetRtspTestStatus() {
      rtspTestedUrl = '';
      setRtspTestStatus('untested', 'Chưa kiểm tra');
    }

    async function testRtspConnection() {
      const rtspUrl = document.getElementById('scheduleRtspInput').value.trim();
      if (!isSupportedStreamUrl(rtspUrl)) {
        setRtspTestStatus('error', 'URL phải bắt đầu bằng rtsp://, http:// hoặc https://');
        return;
      }

      setRtspTestStatus('testing', 'Đang kiểm tra...');
      try {
        const data = await api('/api/schedules/test-rtsp', { method: 'POST', body: JSON.stringify({ rtspUrl }) });
        rtspTestedUrl = rtspUrl;
        setRtspTestStatus(data.success ? 'ok' : 'error', data.message || (data.success ? 'Kết nối thành công' : 'Không kết nối được'));
      } catch (error) {
        rtspTestedUrl = rtspUrl;
        setRtspTestStatus('error', error.message || 'Không kết nối được');
      }
    }

    function isSupportedStreamUrl(url) {
      const value = String(url || '').toLowerCase();
      return value.startsWith('rtsp://') || value.startsWith('http://') || value.startsWith('https://');
    }

    async function newSchedule() {
      state.selectedSchedule = null;
      await loadPlaylists();
      const today = new Date().toISOString().slice(0, 10);
      document.getElementById('scheduleNameInput').value = 'Lịch phát mới';
      document.getElementById('scheduleSourceInput').value = 'FILE';
      document.getElementById('schedulePriorityInput').value = 'NORMAL';
      document.getElementById('scheduleFileModeInput').value = 'PLAYLIST';
      document.getElementById('scheduleRtspInput').value = '';
      document.getElementById('scheduleStartDateInput').value = today;
      document.getElementById('scheduleStartTimeInput').value = '06:00';
      document.getElementById('scheduleEndTimeInput').value = '06:30';
      document.getElementById('scheduleRepeatInput').value = 'ONCE';
      document.getElementById('scheduleEnabledInput').value = 'true';
      resetRtspTestStatus();
      updateScheduleSourceFields();
      showView('scheduleEditor');
    }

    async function editSchedule(scheduleId) {
      await loadPlaylists();
      const data = await api('/api/schedules/' + scheduleId);
      const schedule = data.schedule;
      state.selectedSchedule = schedule;
      document.getElementById('scheduleNameInput').value = schedule.name;
      document.getElementById('scheduleSourceInput').value = schedule.sourceType;
      document.getElementById('schedulePriorityInput').value = schedule.priority;
      document.getElementById('schedulePlaylistInput').value = schedule.playlistId || '';
      document.getElementById('scheduleFileModeInput').value = schedule.fileMode || 'PLAYLIST';
      document.getElementById('scheduleRtspInput').value = schedule.rtspUrl || '';
      document.getElementById('scheduleStartDateInput').value = schedule.startDate;
      document.getElementById('scheduleStartTimeInput').value = schedule.startTime;
      document.getElementById('scheduleEndTimeInput').value = schedule.endTime;
      document.getElementById('scheduleRepeatInput').value = schedule.repeatType;
      document.getElementById('scheduleEnabledInput').value = String(Boolean(schedule.enabled));
      resetRtspTestStatus();
      updateScheduleSourceFields();
      document.getElementById('scheduleFileInput').value = schedule.fileId || '';
      showView('scheduleEditor');
    }

    async function saveSchedule() {
      const sourceType = document.getElementById('scheduleSourceInput').value;
      const fileMode = document.getElementById('scheduleFileModeInput').value;
      const body = {
        name: document.getElementById('scheduleNameInput').value.trim(),
        sourceType,
        priority: document.getElementById('schedulePriorityInput').value,
        playlistId: sourceType === 'FILE' ? document.getElementById('schedulePlaylistInput').value : null,
        fileMode: sourceType === 'FILE' ? fileMode : null,
        fileId: sourceType === 'FILE' && fileMode === 'SINGLE_FILE' ? document.getElementById('scheduleFileInput').value : null,
        rtspUrl: sourceType === 'RTSP' ? document.getElementById('scheduleRtspInput').value.trim() : null,
        startDate: document.getElementById('scheduleStartDateInput').value,
        startTime: document.getElementById('scheduleStartTimeInput').value,
        endTime: document.getElementById('scheduleEndTimeInput').value,
        repeatType: document.getElementById('scheduleRepeatInput').value,
        enabled: document.getElementById('scheduleEnabledInput').value === 'true',
      };

      if (sourceType === 'RTSP' && (rtspTestState !== 'ok' || rtspTestedUrl !== body.rtspUrl)) {
        const confirmed = confirm('Luồng stream chưa được kiểm tra thành công. Bạn vẫn muốn lưu lịch phát này?');
        if (!confirmed) return;
      }

      try {
        if (state.selectedSchedule) {
          await api('/api/schedules/' + state.selectedSchedule.scheduleId, { method: 'PUT', body: JSON.stringify(body) });
        } else {
          await api('/api/schedules', { method: 'POST', body: JSON.stringify(body) });
        }
        await loadSchedules();
        showView('schedules');
        setStatus('Đã lưu lịch phát.');
      } catch (error) {
        setStatus(error.message);
      }
    }

    async function deleteSchedule(scheduleId) {
      if (!confirm('Xóa lịch phát này?')) return;
      await api('/api/schedules/' + scheduleId, { method: 'DELETE' });
      await loadSchedules();
      setStatus('Đã xóa lịch phát.');
    }

    function renderSelectedPlaylist() {
      const playlist = state.selectedPlaylist;
      document.getElementById('playlistNameInput').value = playlist ? playlist.name : '';
      const rows = document.getElementById('playlistItemRows');
      if (!playlist || playlist.items.length === 0) {
        rows.innerHTML = '<tr><td colspan="4" class="muted">Danh sách này chưa có file.</td></tr>';
        return;
      }
      rows.innerHTML = playlist.items.map((item, index) => \`
        <tr>
          <td>\${index + 1}</td>
          <td>\${escapeHtml(item.file.originalName)}</td>
          <td>\${formatBytes(item.file.size)}</td>
          <td><button class="danger" onclick="removePlaylistItem('\${item.playlistItemId}')">Xóa</button></td>
        </tr>
      \`).join('');
    }

    async function createPlaylist() {
      const name = prompt('Nhập tên danh sách phát:', 'Danh sách phát mới');
      if (!name) return;
      const data = await api('/api/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      state.selectedPlaylist = data.playlist;
      await loadFiles();
      renderSelectedPlaylist();
      showView('editor');
      await loadPlaylists();
    }

    async function openPlaylist(playlistId) {
      const data = await api('/api/playlists/' + playlistId);
      state.selectedPlaylist = data.playlist;
      await loadFiles();
      renderSelectedPlaylist();
      showView('editor');
    }

    async function savePlaylistName() {
      if (!state.selectedPlaylist) return;
      const name = document.getElementById('playlistNameInput').value.trim();
      if (!name) return alert('Vui lòng nhập tên danh sách phát.');
      const data = await api('/api/playlists/' + state.selectedPlaylist.playlistId, { method: 'PUT', body: JSON.stringify({ name }) });
      state.selectedPlaylist = data.playlist;
      renderSelectedPlaylist();
      await loadPlaylists();
      setStatus('Đã lưu tên danh sách phát.');
    }

    async function deletePlaylist(playlistId) {
      if (!confirm('Xóa danh sách phát này?')) return;
      await api('/api/playlists/' + playlistId, { method: 'DELETE' });
      await loadPlaylists();
      setStatus('Đã xóa danh sách phát.');
    }

    async function addFileToPlaylist(fileId) {
      if (!state.selectedPlaylist) return;
      const data = await api('/api/playlists/' + state.selectedPlaylist.playlistId + '/items', { method: 'POST', body: JSON.stringify({ fileId }) });
      state.selectedPlaylist = data.playlist;
      renderSelectedPlaylist();
      await loadPlaylists();
      setStatus('Đã thêm file vào danh sách phát.');
    }

    async function removePlaylistItem(itemId) {
      if (!state.selectedPlaylist) return;
      await api('/api/playlists/' + state.selectedPlaylist.playlistId + '/items/' + itemId, { method: 'DELETE' });
      await openPlaylist(state.selectedPlaylist.playlistId);
      await loadPlaylists();
    }

    async function uploadFileToPlaylist() {
      if (!state.selectedPlaylist) return alert('Vui lòng chọn danh sách phát.');
      const fileInput = document.getElementById('fileInput');
      if (fileInput.files.length === 0) return alert('Vui lòng chọn file MP3.');
      const formData = new FormData();
      formData.append('mp3', fileInput.files[0]);
      try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Upload thất bại.');
        socket.emit('admin_file_uploaded', { fileId: data.fileId });
        await loadFiles();
        await addFileToPlaylist(data.fileId);
        fileInput.value = '';
      } catch (error) {
        setStatus(error.message);
      }
    }

    function getRecorderMimeType() {
      const candidates = ['audio/webm;codecs=opus', 'audio/webm'];
      return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
    }

    async function startMic() {
      if (!navigator.mediaDevices || !window.MediaRecorder) {
        alert('Trình duyệt không hỗ trợ thu âm trực tiếp.');
        return;
      }

      stopLocalMic();
      setStatus('Đang xin quyền micro...');

      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = getRecorderMimeType();
        if (!mimeType) throw new Error('Trình duyệt chưa hỗ trợ audio/webm cho demo này.');

        mediaRecorder = new MediaRecorder(micStream, { mimeType });
        mediaRecorder.ondataavailable = async (event) => {
          if (event.data && event.data.size > 0) {
            socket.emit('admin_mic_chunk', await event.data.arrayBuffer());
          }
        };

        socket.emit('admin_play_live');
        mediaRecorder.start(500);
        micBtn.disabled = true;
        setStatus('Đang chuẩn bị Micro...');
      } catch (error) {
        stopLocalMic();
        setStatus(error.message);
      }
    }

    function stopLocalMic() {
      if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
      mediaRecorder = null;
      if (micStream) micStream.getTracks().forEach((track) => track.stop());
      micStream = null;
      micBtn.disabled = false;
    }

    function stop() {
      stopLocalMic();
      socket.emit('admin_stop');
      setStatus('Đã dừng');
    }

    function pauseSchedule() {
      socket.emit('admin_pause_schedule');
      setStatus('Đang tạm dừng lịch phát...');
    }

    function resumeSchedule() {
      socket.emit('admin_resume_schedule');
      setStatus('Đang phát tiếp lịch...');
    }

    socket.on('FILE_AVAILABLE', () => loadFiles().catch((error) => setStatus(error.message)));

    socket.on('admin_error', (data) => {
      stopLocalMic();
      setStatus(data.message || 'Có lỗi xảy ra.');
    });

    socket.on('admin_status', (data) => {
      if (data.status === 'STARTING') setStatus('Đang chuẩn bị phát...');
      if (data.status === 'STARTED') setStatus('Đang phát.');
      if (data.status === 'PAUSED') setStatus('Đã tạm dừng lịch phát.');
      if (data.status === 'RESUMED') setStatus('Đang phát tiếp lịch.');
      if (data.status === 'RESTARTING') setStatus('Luồng URL bị gián đoạn, đang thử kết nối lại lần ' + (data.attempt || 1) + '...');
    });

    socket.on('SCHEDULE_STATUS', (data) => {
      state.scheduleStatus = data || { activeSchedule: null, pausedSchedule: null };
      renderScheduleStatus();
    });

    setInterval(() => { document.getElementById('clock').innerText = new Date().toLocaleTimeString('vi-VN'); }, 1000);
    loadAuthProfile().catch((error) => setStatus(error.message));
    loadPlaylists().catch((error) => setStatus(error.message));
    loadFiles().catch((error) => setStatus(error.message));
    loadSchedules().catch((error) => setStatus(error.message));
    socket.emit('admin_request_schedule_status');
  </script>
</body>
</html>
`);
  }

  @Get('/client')
  @Header('Content-Type', 'text/html; charset=utf-8')
  clientPage() {
    return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Loa xã</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background: #2ecc71;
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      font-family: Arial, sans-serif;
      text-align: center;
      padding: 24px;
    }
    .receiver-panel {
      width: min(760px, 100%);
      padding: 32px;
    }
    #status {
      margin: 0;
      font-size: clamp(34px, 5vw, 64px);
      line-height: 1.15;
      font-weight: 800;
    }
    .now-playing {
      margin-top: 20px;
      padding: 16px 20px;
      border: 2px solid rgba(255,255,255,.5);
      border-radius: 8px;
      background: rgba(0,0,0,.12);
      font-size: clamp(18px, 2.3vw, 28px);
      line-height: 1.45;
      overflow-wrap: anywhere;
    }
    .device-card {
      margin-top: 18px;
      padding: 12px 16px;
      border: 1px solid rgba(255,255,255,.38);
      border-radius: 8px;
      background: rgba(0,0,0,.1);
      color: rgba(255,255,255,.95);
      font-size: 16px;
      line-height: 1.45;
    }
    .label {
      display: block;
      opacity: .85;
      font-size: .72em;
      font-weight: 700;
      text-transform: uppercase;
      margin-bottom: 6px;
    }
    #playBtn {
      display: none;
      margin-top: 24px;
      padding: 18px 22px;
      font-size: 18px;
      cursor: pointer;
      border: 0;
      border-radius: 6px;
      color: #14532d;
      background: white;
      font-weight: 800;
    }
  </style>
</head>
<body>
  <div class="receiver-panel">
    <h1 id="status">CHỜ PHÁT THANH...</h1>
    <div class="now-playing" id="nowPlaying">
      <span class="label">Bản tin đang phát</span>
      <strong id="currentFileName">Chưa có bản tin</strong>
    </div>
    <div class="device-card" id="deviceInfo">Đang kiểm tra chế độ thiết bị...</div>
    <button id="playBtn">NHẤN ĐỂ KẾT NỐI LOA</button>
  </div>
  <audio id="audio" style="display:none"></audio>

  <script src="/socket.io/socket.io.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
  <script>
    const socket = io();
    const audio = document.getElementById('audio');
    const btn = document.getElementById('playBtn');
    const statusEl = document.getElementById('status');
    const currentFileNameEl = document.getElementById('currentFileName');
    const deviceInfoEl = document.getElementById('deviceInfo');
    const params = new URLSearchParams(window.location.search);
    const simulatedDeviceId = (params.get('deviceId') || '').trim();
    const DB_NAME = 'broadcast-cache';
    const STORE_NAME = 'audio-files';
    let dbPromise = null;
    let hls = null;
    let retryTimer = null;
    let connectTimer = null;
    let currentStreamVersion = null;
    let currentObjectUrl = null;
    let currentLocalFileId = null;
    const PUBLIC_HLS_BASE_URL = ${JSON.stringify(config.publicHlsBaseUrl)};
    const POSITION_KEY = 'broadcast-file-positions';
    const localPositions = new Map();

    function setStatus(message) {
      statusEl.innerText = message;
    }

    function setCurrentFileName(name) {
      currentFileNameEl.innerText = name || 'Chưa có bản tin';
    }

    function setDeviceInfo(message) {
      deviceInfoEl.innerText = message;
    }

    function loadStoredPositions() {
      try {
        const parsed = JSON.parse(localStorage.getItem(POSITION_KEY) || '{}');
        Object.entries(parsed).forEach(([fileId, seconds]) => {
          const value = Number(seconds);
          if (Number.isFinite(value) && value >= 0) localPositions.set(fileId, value);
        });
      } catch {
        localPositions.clear();
      }
    }

    function saveStoredPositions() {
      const positions = {};
      localPositions.forEach((seconds, fileId) => { positions[fileId] = seconds; });
      localStorage.setItem(POSITION_KEY, JSON.stringify(positions));
    }

    function getLocalPosition(fileId) {
      return localPositions.get(fileId) || 0;
    }

    function setLocalPosition(fileId, seconds) {
      const value = Number(seconds);
      if (!fileId || !Number.isFinite(value) || value < 0) return;
      localPositions.set(fileId, value);
      saveStoredPositions();
    }

    function rememberCurrentPosition() {
      if (!currentLocalFileId || audio.ended || !Number.isFinite(audio.currentTime)) return;
      setLocalPosition(currentLocalFileId, audio.currentTime);
    }

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { keyPath: 'fileId' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return dbPromise;
    }

    async function getCachedFile(fileId) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(fileId);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    }

    async function putCachedFile(record) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    async function ensureCached(file) {
      const existing = await getCachedFile(file.fileId);
      if (existing && existing.size === file.size) {
        socket.emit('client_file_ready', { fileId: file.fileId });
        return existing;
      }

      setStatus('ĐANG TẢI FILE: ' + file.originalName);
      setCurrentFileName(file.originalName);
      const response = await fetch(file.url);
      if (!response.ok) throw new Error('Không tải được file ' + file.originalName);
      const blob = await response.blob();
      const record = { ...file, blob, cachedAt: new Date().toISOString() };
      await putCachedFile(record);
      socket.emit('client_file_ready', { fileId: file.fileId });
      setStatus('SẴN SÀNG PHÁT THANH');
      return record;
    }

    function cleanupHls() {
      if (retryTimer) clearTimeout(retryTimer);
      if (connectTimer) clearTimeout(connectTimer);
      retryTimer = null;
      connectTimer = null;
      if (hls) hls.destroy();
      hls = null;
    }

    function cleanupLocalAudio() {
      rememberCurrentPosition();
      audio.pause();
      audio.ontimeupdate = null;
      audio.onloadedmetadata = null;
      audio.onended = null;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
      currentLocalFileId = null;
      audio.removeAttribute('src');
      audio.load();
      setCurrentFileName('');
    }

    function stopPlayback() {
      cleanupHls();
      cleanupLocalAudio();
      currentStreamVersion = null;
      setStatus('CHỜ PHÁT THANH...');
    }

    async function findFileInCatalog(fileId) {
      const response = await fetch('/api/files');
      if (!response.ok) return null;
      const data = await response.json();
      return (data.files || []).find((file) => file.fileId === fileId) || null;
    }

    function getSyncedStartPosition(fileId, resetPosition, startOffsetSeconds, serverTimeMs, receivedAtMs) {
      const offset = Number(startOffsetSeconds);
      const serverTime = Number(serverTimeMs);
      const receivedAt = Number(receivedAtMs);
      if (Number.isFinite(offset) && (Number.isFinite(receivedAt) || Number.isFinite(serverTime))) {
        const baseTime = Number.isFinite(receivedAt) ? receivedAt : serverTime;
        const elapsedSeconds = Math.max(0, (Date.now() - baseTime) / 1000);
        return Math.max(0, offset + elapsedSeconds);
      }

      return resetPosition ? 0 : getLocalPosition(fileId);
    }

    async function playCached(fileId, resetPosition, startOffsetSeconds, serverTimeMs, receivedAtMs) {
      cleanupHls();
      let record = await getCachedFile(fileId);
      if (!record) {
        const file = await findFileInCatalog(fileId);
        if (!file) {
          setStatus('CHƯA CÓ FILE TRONG CACHE...');
          setCurrentFileName('');
          return;
        }
        record = await ensureCached(file);
      }

      cleanupLocalAudio();
      setCurrentFileName(record.originalName);
      currentLocalFileId = fileId;
      currentObjectUrl = URL.createObjectURL(record.blob);
      audio.src = currentObjectUrl;
      const startPosition = getSyncedStartPosition(fileId, resetPosition, startOffsetSeconds, serverTimeMs, receivedAtMs);
      setLocalPosition(fileId, startPosition);
      let shouldPlay = true;
      await new Promise((resolve) => {
        audio.onloadedmetadata = () => {
          if (Number.isFinite(audio.duration) && startPosition >= Math.max(0, audio.duration - 0.25)) {
            shouldPlay = false;
            setLocalPosition(fileId, 0);
            currentLocalFileId = null;
            socket.emit('client_file_ended', { fileId });
            resolve();
            return;
          }

          if (startPosition > 0) {
            audio.currentTime = startPosition;
          }
          resolve();
        };
        audio.onerror = () => resolve();
        audio.load();
      });

      if (!shouldPlay) {
        audio.pause();
        audio.onloadedmetadata = null;
        audio.onerror = null;
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        currentObjectUrl = null;
        audio.removeAttribute('src');
        audio.load();
        setStatus('ĐANG CHUYỂN BẢN TIN...');
        return;
      }

      audio.onerror = null;
      audio.onloadedmetadata = null;
      audio.ontimeupdate = () => setLocalPosition(fileId, audio.currentTime);
      audio.onended = () => {
        setLocalPosition(fileId, 0);
        currentLocalFileId = null;
        socket.emit('client_file_ended', { fileId });
      };

      audio.play()
        .then(() => {
          btn.style.display = 'none';
          setStatus('ĐANG PHÁT THANH...');
          setCurrentFileName(record.originalName);
        })
        .catch(() => {
          btn.style.display = 'inline-block';
          setStatus('NHẤN ĐỂ KẾT NỐI LOA');
          setCurrentFileName(record.originalName);
        });
    }

    function getStreamUrl(version) {
      const cacheVersion = encodeURIComponent(version || Date.now());
      const baseUrl = PUBLIC_HLS_BASE_URL || ('http://' + window.location.hostname + ':8888');
      return baseUrl.replace(/\\/+$/, '') + '/${config.streamPath}/index.m3u8?v=' + cacheVersion;
    }

    function startHlsPlayer(version) {
      cleanupLocalAudio();
      cleanupHls();
      currentStreamVersion = version || Date.now();
      setStatus('ĐANG KẾT NỐI LOA...');
      setCurrentFileName('Phát trực tiếp');

      if (!Hls.isSupported()) {
        setStatus('TRÌNH DUYỆT KHÔNG HỖ TRỢ HLS.JS');
        return;
      }

      hls = new Hls({ lowLatencyMode: true, backBufferLength: 0 });
      hls.loadSource(getStreamUrl(currentStreamVersion));
      hls.attachMedia(audio);

      const startVersion = currentStreamVersion;
      connectTimer = setTimeout(() => {
        if (startVersion === currentStreamVersion) startHlsPlayer(startVersion);
      }, 5000);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (connectTimer) clearTimeout(connectTimer);
        audio.play()
          .then(() => {
            btn.style.display = 'none';
            setStatus('ĐANG PHÁT THANH...');
            setCurrentFileName('Phát trực tiếp');
          })
          .catch(() => {
            btn.style.display = 'inline-block';
            setStatus('NHẤN ĐỂ KẾT NỐI LOA');
            setCurrentFileName('Phát trực tiếp');
          });
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;
        const retryVersion = currentStreamVersion;
        cleanupHls();
        retryTimer = setTimeout(() => {
          if (retryVersion === currentStreamVersion) startHlsPlayer(retryVersion);
        }, 1000);
      });
    }

    btn.addEventListener('click', () => audio.play().catch(() => null));

    socket.on('connect', () => {
      socket.emit('client_register_device', { deviceId: simulatedDeviceId });
    });

    socket.on('client_registration_status', (payload) => {
      if (payload.status === 'REGISTERED' && payload.device) {
        setDeviceInfo('Thiết bị mô phỏng: ' + payload.device.name + ' | Địa bàn: ' + payload.device.area + ' | ID: ' + payload.device.deviceId);
        return;
      }

      if (payload.status === 'ERROR') {
        setDeviceInfo((payload.message || 'Không đăng ký được thiết bị mô phỏng.') + ' ID: ' + (payload.deviceId || simulatedDeviceId || 'trống'));
        return;
      }

      setDeviceInfo(payload.message || 'Chế độ demo global: không kiểm tra được target thiết bị/địa bàn.');
    });

    socket.on('FILE_AVAILABLE', (file) => {
      ensureCached(file).catch((error) => {
        socket.emit('client_file_error', { fileId: file.fileId, message: error.message });
        setStatus('LỖI TẢI FILE');
      });
    });

    socket.on('PLAY_CACHED', (data) => {
      playCached(data.fileId, Boolean(data.resetPosition), data.startOffsetSeconds, data.serverTimeMs, Date.now());
    });

    socket.on('STOP', stopPlayback);

    socket.on('client_update', (data) => {
      if (data.action === 'START') startHlsPlayer(data.streamVersion);
      if (data.action === 'STOP') stopPlayback();
    });

    window.addEventListener('load', () => {
      loadStoredPositions();
      setStatus('CHỜ PHÁT THANH...');
      setCurrentFileName('');
      if (simulatedDeviceId) {
        setDeviceInfo('Đang đăng ký thiết bị mô phỏng: ' + simulatedDeviceId);
      } else {
        setDeviceInfo('Chế độ demo global. Mở /client?deviceId=<id> để kiểm tra phát theo thiết bị/địa bàn.');
      }
    });
  </script>
</body>
</html>
`;
  }
}
