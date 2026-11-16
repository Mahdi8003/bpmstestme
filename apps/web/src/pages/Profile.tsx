import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AuthSession } from '@ravand/shared';
import { Key, UserCircle } from '@phosphor-icons/react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { roleLabel } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { InstallAppCard } from '@/components/InstallApp';
import { useToast } from '@/components/ToastProvider';
import { Avatar, Button, Card, Field, Input } from '@/components/ui';

export function ProfilePage() {
  const { user, tenant } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [name, setName] = useState(user?.name ?? '');
  const [jobTitle, setJobTitle] = useState(user?.jobTitle ?? '');
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setJobTitle(user?.jobTitle ?? '');
  }, [user?.id, user?.name, user?.jobTitle]);

  const saveProfile = async () => {
    setProfileError('');
    if (name.trim().length < 2) {
      setProfileError('نام باید دست‌کم دو حرف باشد.');
      return;
    }
    setSavingProfile(true);
    try {
      const session = await api.patch<AuthSession>('/auth/me', {
        name: name.trim(),
        jobTitle: jobTitle.trim(),
      });
      queryClient.setQueryData(['auth'], session);
      toast.success('پروفایل به‌روز شد.');
    } catch (error) {
      setProfileError(errorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    setPasswordError('');
    if (newPassword.length < 8) {
      setPasswordError('رمز عبور جدید باید دست‌کم ۸ نویسه باشد.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('تکرار رمز عبور جدید مطابقت ندارد.');
      return;
    }
    setChangingPassword(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('رمز عبور تغییر کرد. نشست‌های دیگر بسته شدند.');
    } catch (error) {
      setPasswordError(errorMessage(error));
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="پروفایل"
        title="حساب کاربری شما."
        description="نام نمایشی، عنوان شغلی و رمز عبور خود را مدیریت کنید."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Avatar name={user?.name ?? ''} color={user?.avatarColor} size="lg" />
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink-900">{user?.name}</div>
              <div className="mt-1 text-[11px] text-ink-400">{user?.email}</div>
              <div className="mt-1 text-[10px] text-ink-400">
                {user?.roleName ?? roleLabel(user?.role ?? 'member')} · {tenant?.name}
              </div>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            <Field label="نام نمایشی" required error={profileError || undefined}>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={100} />
            </Field>
            <Field label="عنوان شغلی" hint="اختیاری؛ در فهرست کاربران نمایش داده می‌شود.">
              <Input
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                maxLength={100}
                placeholder="مثلاً کارشناس مالی"
              />
            </Field>
            <Button
              variant="copper"
              icon={<UserCircle size={16} />}
              loading={savingProfile}
              onClick={() => void saveProfile()}
            >
              ذخیره پروفایل
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <Key size={17} /> تغییر رمز عبور
          </div>
          <p className="mt-2 text-[11px] leading-6 text-ink-400">
            پس از تغییر رمز، همهٔ نشست‌های دیگر شما بسته می‌شوند.
          </p>
          <div className="mt-5 space-y-4">
            <Field label="رمز عبور فعلی" required>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </Field>
            <Field label="رمز عبور جدید" required error={passwordError || undefined}>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </Field>
            <Field label="تکرار رمز عبور جدید" required>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </Field>
            <Button
              variant="paper"
              icon={<Key size={16} />}
              loading={changingPassword}
              disabled={!currentPassword || !newPassword}
              onClick={() => void changePassword()}
            >
              تغییر رمز عبور
            </Button>
          </div>
        </Card>
      </div>

      <div className="mt-5">
        <InstallAppCard />
      </div>
    </div>
  );
}
