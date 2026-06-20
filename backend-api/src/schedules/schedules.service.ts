import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { config } from '../config';
import { StorageService } from '../storage/storage.service';
import { BroadcastScheduleRecord, ScheduleInput, SchedulePriority, ScheduleRepeatType } from './schedule.types';

@Injectable()
export class SchedulesService {
  constructor(private readonly storage: StorageService) {}

  listSchedules() {
    return this.storage.listSchedules();
  }

  async getSchedule(scheduleId: string) {
    const schedule = await this.storage.getSchedule(scheduleId);
    if (!schedule) throw new NotFoundException('Khong tim thay lich phat.');
    return schedule;
  }

  async createSchedule(input: ScheduleInput) {
    const schedule = this.normalizeInput(input);
    await this.ensureNoPriorityConflict(schedule);
    return this.storage.createSchedule(schedule);
  }

  async updateSchedule(scheduleId: string, input: ScheduleInput) {
    const current = await this.getSchedule(scheduleId);
    const schedule = this.normalizeInput({ ...current, ...input });
    await this.ensureNoPriorityConflict(schedule, scheduleId);
    const updated = await this.storage.updateSchedule(scheduleId, schedule);
    if (!updated) throw new NotFoundException('Khong tim thay lich phat.');
    return updated;
  }

  deleteSchedule(scheduleId: string) {
    return this.storage.deleteSchedule(scheduleId);
  }

  logScheduleRun(scheduleId: string, status: 'STARTED' | 'FINISHED' | 'FAILED' | 'SKIPPED', message?: string | null) {
    return this.storage.createScheduleRunLog(scheduleId, status, message || null);
  }

  getRunnableSchedules(schedules: BroadcastScheduleRecord[], now = new Date()) {
    return schedules.filter((schedule) => schedule.enabled && this.isScheduleActive(schedule, now));
  }

  isScheduleActive(schedule: BroadcastScheduleRecord, now = new Date()) {
    const localNow = this.getLocalNow(now);
    if (!this.matchesRepeat(schedule, localNow)) return false;

    const nowMinutes = localNow.hour * 60 + localNow.minute;
    const startMinutes = this.timeToMinutes(schedule.startTime);
    const endMinutes = this.timeToMinutes(schedule.endTime);
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  private normalizeInput(input: ScheduleInput): Required<ScheduleInput> {
    const sourceType = input.sourceType || 'FILE';
    const priority = input.priority || 'NORMAL';
    const repeatType = input.repeatType || 'ONCE';
    const enabled = input.enabled !== false;
    const name = (input.name || 'Lịch phát mới').trim();
    const startDate = input.startDate || this.getLocalNow().date;
    const startTime = input.startTime || '06:00';
    const endTime = input.endTime || '06:30';
    const fileMode = sourceType === 'FILE' ? input.fileMode || 'PLAYLIST' : null;
    const playlistId = sourceType === 'FILE' ? input.playlistId || null : null;
    const fileId = sourceType === 'FILE' && fileMode === 'SINGLE_FILE' ? input.fileId || null : null;
    const rtspUrl = sourceType === 'RTSP' ? (input.rtspUrl || '').trim() : null;
    const repeatCount = sourceType === 'FILE' ? this.normalizeRepeatCount(input.repeatCount) : 0;

    if (!name) throw new BadRequestException('Vui lòng nhập tên lịch phát.');
    if (!['FILE', 'RTSP'].includes(sourceType)) throw new BadRequestException('Kiểu phát không hợp lệ.');
    if (!['NORMAL', 'EMERGENCY'].includes(priority)) throw new BadRequestException('Mức ưu tiên không hợp lệ.');
    if (!['ONCE', 'DAILY', 'WEEKLY', 'MONTHLY'].includes(repeatType)) throw new BadRequestException('Kiểu lặp không hợp lệ.');
    if (!this.isDate(startDate)) throw new BadRequestException('Ngày bắt đầu không hợp lệ.');
    if (!this.isTime(startTime) || !this.isTime(endTime)) throw new BadRequestException('Giờ phát không hợp lệ.');
    if (this.timeToMinutes(endTime) <= this.timeToMinutes(startTime)) {
      throw new BadRequestException('Giờ kết thúc phải lớn hơn giờ bắt đầu.');
    }
    if (sourceType === 'FILE' && !playlistId) throw new BadRequestException('Vui lòng chọn danh sách phát.');
    if (sourceType === 'FILE' && fileMode === 'SINGLE_FILE' && !fileId) {
      throw new BadRequestException('Vui lòng chọn file cần phát.');
    }
    if (sourceType === 'RTSP' && (!rtspUrl || !this.isSupportedStreamUrl(rtspUrl))) {
      throw new BadRequestException('Stream URL phải bắt đầu bằng rtsp://, http:// hoặc https://');
    }

    return {
      name,
      sourceType,
      priority,
      playlistId,
      fileId,
      fileMode,
      rtspUrl,
      startDate,
      startTime,
      endTime,
      repeatType,
      repeatCount,
      enabled,
    };
  }

  private normalizeRepeatCount(value: unknown) {
    const repeatCount = value === undefined || value === null || value === '' ? 0 : Number(value);
    if (!Number.isInteger(repeatCount) || repeatCount < 0 || repeatCount > 30) {
      throw new BadRequestException('Số lần phát lặp lại phải là số nguyên từ 0 đến 30.');
    }
    return repeatCount;
  }

  private async ensureNoPriorityConflict(schedule: Required<ScheduleInput>, ignoreScheduleId?: string) {
    if (!schedule.enabled) return;

    const schedules = await this.storage.listSchedules();
    const conflict = schedules.find((existing) => {
      if (!existing.enabled || existing.scheduleId === ignoreScheduleId) return false;
      if (!this.hasRepeatOverlap(existing.repeatType, schedule.repeatType)) return false;
      if (!this.hasDateOverlap(existing, schedule)) return false;
      if (!this.hasTimeOverlap(existing.startTime, existing.endTime, schedule.startTime, schedule.endTime)) return false;

      const existingPriority = existing.priority;
      const nextPriority = schedule.priority as SchedulePriority;
      return existingPriority === nextPriority;
    });

    if (!conflict) return;

    const priorityLabel = schedule.priority === 'EMERGENCY' ? 'lịch khẩn cấp' : 'lịch thường';
    throw new BadRequestException(`Khung giờ này đã trùng với ${priorityLabel} "${conflict.name}" (${this.formatConflictSchedule(conflict)}).`);
  }

  private matchesRepeat(schedule: BroadcastScheduleRecord, localNow: LocalNow) {
    if (localNow.date < schedule.startDate) return false;

    if (schedule.repeatType === 'ONCE') {
      return localNow.date === schedule.startDate;
    }
    if (schedule.repeatType === 'DAILY') return true;
    if (schedule.repeatType === 'WEEKLY') return localNow.dayOfWeek === this.dayOfWeek(schedule.startDate);
    if (schedule.repeatType === 'MONTHLY') return localNow.dayOfMonth === this.dayOfMonth(schedule.startDate);
    return false;
  }

  private hasRepeatOverlap(a: ScheduleRepeatType, b: ScheduleRepeatType) {
    return true;
  }

  private hasDateOverlap(a: BroadcastScheduleRecord, b: Required<ScheduleInput>) {
    if (a.repeatType !== 'ONCE' || b.repeatType !== 'ONCE') return true;
    return a.startDate === b.startDate;
  }

  private hasTimeOverlap(startA: string, endA: string, startB: string, endB: string) {
    return this.timeToMinutes(startA) < this.timeToMinutes(endB) && this.timeToMinutes(startB) < this.timeToMinutes(endA);
  }

  private formatConflictSchedule(schedule: BroadcastScheduleRecord) {
    return `${schedule.startDate} ${schedule.startTime.slice(0, 5)}-${schedule.endTime.slice(0, 5)}, ${this.repeatLabel(schedule.repeatType)}`;
  }

  private repeatLabel(value: ScheduleRepeatType) {
    return {
      ONCE: 'Một lần',
      DAILY: 'Hằng ngày',
      WEEKLY: 'Hằng tuần',
      MONTHLY: 'Hằng tháng',
    }[value];
  }

  private isDate(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
  }

  private isTime(value: string) {
    return /^\d{2}:\d{2}$/.test(value) && this.timeToMinutes(value) >= 0 && this.timeToMinutes(value) < 24 * 60;
  }

  private isSupportedStreamUrl(url: string) {
    const value = url.toLowerCase();
    return value.startsWith('rtsp://') || value.startsWith('http://') || value.startsWith('https://');
  }

  private timeToMinutes(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private getLocalNow(now = new Date()): LocalNow {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: config.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const value = (type: string) => parts.find((part) => part.type === type)?.value || '0';
    const date = `${value('year')}-${value('month')}-${value('day')}`;

    return {
      date,
      hour: Number(value('hour')),
      minute: Number(value('minute')),
      dayOfWeek: this.dayOfWeek(date),
      dayOfMonth: this.dayOfMonth(date),
    };
  }

  private dayOfWeek(date: string) {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  }

  private dayOfMonth(date: string) {
    return Number(date.split('-')[2]);
  }
}

type LocalNow = {
  date: string;
  hour: number;
  minute: number;
  dayOfWeek: number;
  dayOfMonth: number;
};
