import { useState } from 'react';
import { SafeAreaView, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { createApiClient, ApiClientError } from '@sahana/api-client';
import { isLocale, SUPPORTED_LOCALES, translate, type Locale } from '@sahana/i18n';
import { color, fontSize, lineHeight, space } from '@sahana/design-tokens';
import type { LoginResponse } from '@sahana/types';
import { Button, TextField } from '@sahana/ui-mobile';

const REFRESH_KEY = 'sahana.refresh';
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000';

export default function App() {
  const [locale, setLocale] = useState<Locale>('en');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [societyName, setSocietyName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [requestType, setRequestType] = useState('');
  const [phone, setPhone] = useState('');
  const [description, setDescription] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [statusCode, setStatusCode] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState<'home' | 'requests' | 'profile'>('home');
  const [home, setHome] = useState<{
    member: { memberNo?: string; givenName?: string; familyName?: string; statusCode?: string } | null;
    claims: { id: string; status?: string; eligibilityStatus?: string }[];
    emergencies: { id: string; requestType?: string; status?: string }[];
  } | null>(null);
  const [idempotencyKey] = useState(() => `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);
  const t = (key: string) => translate(locale, key);

  const client = createApiClient({
    baseUrl: apiUrl,
    getAccessToken: () => accessToken,
  });

  async function signIn() {
    setPending(true);
    setError(null);
    try {
      const result = await client.request<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, client: 'mobile' }),
      });
      if (!result.refreshToken || !result.accessToken) {
        setError(t('errors.generic'));
        return;
      }
      await SecureStore.setItemAsync(REFRESH_KEY, result.refreshToken);
      setAccessToken(result.accessToken);
      setDisplayName(result.user.displayName);
      setSocietyName(result.society.name);
      const authed = createApiClient({
        baseUrl: apiUrl,
        getAccessToken: () => result.accessToken ?? null,
      });
      void authed
        .request<NonNullable<typeof home>>('/api/v1/me/home')
        .then((channel) => {
          setHome(channel);
          if (channel.member && typeof channel.member === 'object' && 'id' in channel.member) {
            setMemberId(String((channel.member as { id: string }).id));
          }
        })
        .catch(() => setHome(null));
      if (isLocale(result.user.preferredLanguage)) setLocale(result.user.preferredLanguage);
      else {
        try {
          const config = await createApiClient({
            baseUrl: apiUrl,
            getAccessToken: () => result.accessToken ?? null,
          }).request<{ defaultLanguage?: string }>('/api/v1/config');
          if (isLocale(config.defaultLanguage)) setLocale(config.defaultLanguage);
        } catch {
          // The signed-in shell still works if configuration cannot be read.
        }
      }
      try {
        const mine = await createApiClient({
          baseUrl: apiUrl,
          getAccessToken: () => result.accessToken ?? null,
        }).request<{ id: string }>('/api/v1/members/me');
        setMemberId(mine.id);
      } catch (caught) {
        if (!(caught instanceof ApiClientError) || caught.status !== 404) {
          setMemberId(null);
        }
      }
    } catch (caught) {
      if (caught instanceof ApiClientError) setError(t(caught.body.messageKey ?? 'auth.signIn.failed'));
      else setError(t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function submitEmergency() {
    if (!accessToken) return;
    setPending(true);
    setError(null);
    try {
      let linked = memberId;
      if (!linked) {
        const created = await client.request<{ id: string }>('/api/v1/members', {
          method: 'POST',
          body: JSON.stringify({
            memberNo,
            givenName,
            familyName,
            statusCode,
            categoryCode,
            linkToCurrentUser: true,
          }),
        });
        linked = created.id;
        setMemberId(created.id);
      }
      await client.request('/api/v1/emergency-requests', {
        method: 'POST',
        body: JSON.stringify({
          memberId: linked,
          requestType,
          phone,
          description,
          idempotencyKey,
        }),
      });
      setSubmitted(true);
    } catch (caught) {
      if (caught instanceof ApiClientError) setError(t(caught.body.messageKey ?? 'errors.generic'));
      else setError(t('errors.generic'));
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    await SecureStore.deleteItemAsync(REFRESH_KEY);
    setAccessToken(null);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: fontSize.body, fontWeight: '700', color: color.text }}>{t('common.appName')}</Text>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {SUPPORTED_LOCALES.map((code) => (
              <Text
                key={code}
                accessibilityRole="button"
                onPress={() => {
                  setLocale(code);
                  if (accessToken) {
                    void client.request('/api/v1/me/language', {
                      method: 'POST',
                      body: JSON.stringify({ language: code }),
                    });
                  }
                }}
                style={{
                  color: locale === code ? color.primaryInk : color.body,
                  fontSize: fontSize.dense,
                  lineHeight: fontSize.dense * lineHeight.body,
                  paddingVertical: space[2],
                }}
              >
                {t(`common.language.${code}`)}
              </Text>
            ))}
          </View>
        </View>
        {accessToken ? (
          <View style={{ gap: space[4] }}>
            <Text style={{ fontSize: fontSize.body, color: color.text }}>{displayName}</Text>
            {societyName ? <Text style={{ color: color.body, fontSize: fontSize.dense }}>{societyName}</Text> : null}
            <View style={{ flexDirection: 'row', gap: space[3] }}>
              {(['home', 'requests', 'profile'] as const).map((item) => (
                <Text
                  key={item}
                  accessibilityRole="button"
                  onPress={() => setTab(item)}
                  style={{ color: tab === item ? color.primaryInk : color.body, fontSize: fontSize.dense, paddingVertical: space[2] }}
                >
                  {t(item === 'home' ? 'shell.nav.home' : item === 'requests' ? 'shell.nav.requests' : 'shell.nav.profile')}
                </Text>
              ))}
            </View>
            <Text style={{ color: color.text, fontSize: fontSize.dense, lineHeight: fontSize.dense * lineHeight.body }}>
              {t('shell.emergency.notASubstitute')}
            </Text>
            {tab === 'profile' ? (
              <View style={{ gap: space[2] }}>
                <Text style={{ color: color.text, fontSize: fontSize.body }}>
                  {home?.member?.givenName ?? ''} {home?.member?.familyName ?? ''}
                </Text>
                <Text style={{ color: color.body }}>{home?.member?.memberNo ?? t('common.state.empty')}</Text>
                <Text style={{ color: color.body }}>{home?.member?.statusCode ?? ''}</Text>
              </View>
            ) : null}
            {tab === 'requests' ? (
              <View style={{ gap: space[2] }}>
                {(home?.emergencies ?? []).map((item) => (
                  <Text key={item.id} style={{ color: color.text }}>
                    {item.requestType} · {item.status}
                  </Text>
                ))}
                {(home?.claims ?? []).map((item) => (
                  <Text key={item.id} style={{ color: color.text }}>
                    {item.status} · {item.eligibilityStatus}
                  </Text>
                ))}
                {(home?.emergencies.length ?? 0) + (home?.claims.length ?? 0) === 0 ? (
                  <Text style={{ color: color.body }}>{t('common.state.empty')}</Text>
                ) : null}
              </View>
            ) : null}
            {tab === 'home' && submitted ? (
              <Text style={{ color: color.successInk, fontSize: fontSize.body }}>{t('modules.saved')}</Text>
            ) : tab === 'home' ? (
              <View style={{ gap: space[3] }}>
                <Text style={{ color: color.text, fontWeight: '700', fontSize: fontSize.body }}>{t('shell.emergency.title')}</Text>
                {memberId ? null : (
                  <>
                    <TextField label={t('modules.field.memberNo')} value={memberNo} onChangeText={setMemberNo} />
                    <TextField label={t('modules.field.givenName')} value={givenName} onChangeText={setGivenName} />
                    <TextField label={t('modules.field.familyName')} value={familyName} onChangeText={setFamilyName} />
                    <TextField label={t('modules.field.statusCode')} value={statusCode} onChangeText={setStatusCode} />
                    <TextField label={t('modules.field.categoryCode')} value={categoryCode} onChangeText={setCategoryCode} />
                  </>
                )}
                <TextField label={t('modules.field.requestType')} value={requestType} onChangeText={setRequestType} />
                <TextField label={t('modules.field.phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <TextField label={t('modules.field.description')} value={description} onChangeText={setDescription} />
                {error ? <Text style={{ color: color.dangerInk }}>{error}</Text> : null}
                <Button label={t('common.action.save')} loading={pending} onPress={() => void submitEmergency()} />
              </View>
            ) : null}
            <Button label={t('common.action.signOut')} onPress={() => void signOut()} />
          </View>
        ) : (
          <View style={{ gap: space[3] }}>
            <Text style={{ fontSize: 22, fontWeight: '700', color: color.text }}>{t('auth.signIn.title')}</Text>
            <TextField
              label={t('auth.signIn.email')}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextField
              label={t('auth.signIn.password')}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            {error ? <Text style={{ color: color.dangerInk }}>{error}</Text> : null}
            <Button label={t('auth.signIn.submit')} loading={pending} onPress={() => void signIn()} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
