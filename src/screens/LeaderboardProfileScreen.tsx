import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  Platform,
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
} from 'react-native';
import { SvgXml } from 'react-native-svg';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../services/supabase';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

const backIcon = `
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

type LeaderboardProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'LeaderboardProfile'>;

interface UserProfileData {
  id: string;
  display_name: string;
  profile_image_url: string | undefined;
  bio?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  website?: string;
  points: number;
  workout_count: number;
  streak_days: number;
  rank: number;
  last_workout_date: string;
  skill_level?: string;
}

const LeaderboardProfileScreen: React.FC<LeaderboardProfileScreenProps> = ({ navigation, route }) => {
  const { colors, currentTheme } = useTheme();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfileData | null>(null);
  const [displayedPoints, setDisplayedPoints] = useState('0');
  const [displayedWorkouts, setDisplayedWorkouts] = useState('0');
  const [displayedStreak, setDisplayedStreak] = useState('0');
  
  const animatedPoints = new Animated.Value(0);
  const animatedWorkouts = new Animated.Value(0);
  const animatedStreak = new Animated.Value(0);

  const loadUserProfile = async () => {
    try {
      setIsLoading(true);
      
      // Leaderboard verilerini çek (display_name artık burada)
      const { data: leaderboardData, error: leaderboardError } = await supabase
        .from('leaderboard')
        .select(`
          user_id,
          points,
          workout_count,
          streak_days,
          last_workout_date,
          display_name,
          ispremium
        `)
        .eq('user_id', route.params.userId)
        .maybeSingle();

      if (leaderboardError) {
        console.error('Leaderboard verisi alınırken hata:', leaderboardError);
        return;
      }

      // Profil bilgilerini al
      // Other users' profiles are private; this RPC returns only their public fields.
      const { data: profileData, error: profileError } = await supabase
        .rpc('get_public_profile', { p_user_id: route.params.userId })
        .maybeSingle();

      if (profileError) {
        console.error('Profil bilgileri alınırken hata:', profileError);
        return;
      }

      // Rank hesaplamak için tüm leaderboard'u al
      const { data: allData, error: allError } = await supabase
        .from('leaderboard')
        .select('user_id, points')
        .order('points', { ascending: false });

      const rank = allData ? allData.findIndex(item => item.user_id === route.params.userId) + 1 : 0;

      if (leaderboardData && profileData) {
        const profile: UserProfileData = {
          id: route.params.userId,
          display_name: leaderboardData.display_name || route.params.display_name || t('leaderboard_anonymous_user'),
          profile_image_url: undefined, // Şimdilik avatar kullanmıyoruz
          bio: profileData.bio,
          instagram: profileData.instagram,
          twitter: profileData.twitter,
          linkedin: profileData.linkedin,
          website: profileData.website,
          skill_level: profileData.skill_level,
          points: leaderboardData.points || 0,
          workout_count: leaderboardData.workout_count || 0,
          streak_days: leaderboardData.streak_days || 0,
          rank: rank,
          last_workout_date: leaderboardData.last_workout_date || '',
        };

        setUserProfile(profile);

        // Animasyonları başlat
        Animated.parallel([
          Animated.timing(animatedPoints, {
            toValue: profile.points,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(animatedWorkouts, {
            toValue: profile.workout_count,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          }),
          Animated.timing(animatedStreak, {
            toValue: profile.streak_days,
            duration: 1000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: false,
          }),
        ]).start();
      }
    } catch (error) {
      console.error('Profil yüklenirken hata:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUserProfile();

    // Animasyon listener'ları ekle
    const listeners = [
      animatedPoints.addListener(({ value }) => setDisplayedPoints(Math.floor(value).toString())),
      animatedWorkouts.addListener(({ value }) => setDisplayedWorkouts(Math.floor(value).toString())),
      animatedStreak.addListener(({ value }) => setDisplayedStreak(Math.floor(value).toString())),
    ];

    return () => {
      // Listener'ları temizle
      listeners.forEach((listener, index) => {
        switch (index) {
          case 0: animatedPoints.removeListener(listener); break;
          case 1: animatedWorkouts.removeListener(listener); break;
          case 2: animatedStreak.removeListener(listener); break;
        }
      });
    };
  }, [route.params.userId]);

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      return t('leaderboard_profile_unknown_date');
    }
  };

  const getRankEmoji = (rank: number) => {
    switch (rank) {
      case 1: return '🥇';
      case 2: return '🥈';
      case 3: return '🥉';
      default: return '🏆';
    }
  };

  const renderSocialButtons = () => {
    if (!userProfile?.instagram && !userProfile?.twitter && !userProfile?.linkedin && !userProfile?.website) {
      return null;
    }

    const handleLinkedInPress = () => {
      if (userProfile?.linkedin) {
        const url = userProfile.linkedin.startsWith('http') ? userProfile.linkedin : `https://linkedin.com/in/${userProfile.linkedin}`;
        Linking.openURL(url);
      }
    };

    return (
      <View style={styles.socialLinks}>
        {userProfile?.instagram && (
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.card }]}
            onPress={() => Linking.openURL(`https://instagram.com/${userProfile.instagram}`)}
          >
            <Text style={[styles.socialButtonText, { color: colors.primary }]}>{t('leaderboard_profile_instagram')}</Text>
          </TouchableOpacity>
        )}
        {userProfile?.twitter && (
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.card }]}
            onPress={() => Linking.openURL(`https://twitter.com/${userProfile.twitter}`)}
          >
            <Text style={[styles.socialButtonText, { color: colors.primary }]}>{t('leaderboard_profile_twitter')}</Text>
          </TouchableOpacity>
        )}
        {userProfile?.linkedin && (
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.card }]}
            onPress={handleLinkedInPress}
          >
            <Text style={[styles.socialButtonText, { color: colors.primary }]}>{t('leaderboard_profile_linkedin')}</Text>
          </TouchableOpacity>
        )}
        {userProfile?.website && (
          <TouchableOpacity 
            style={[styles.socialButton, { backgroundColor: colors.card }]}
            onPress={() => userProfile.website && Linking.openURL(userProfile.website)}
          >
            <Text style={[styles.socialButtonText, { color: colors.primary }]}>{t('leaderboard_profile_website')}</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderStats = () => {
    if (!userProfile) return null;

    return (
      <View style={[styles.statsContainer, { backgroundColor: colors.card }]}>
        <View style={styles.ratingSection}>
          <Text style={[styles.ratingTitle, { color: colors.textSecondary }]}>{t('leaderboard_profile_points_title')}</Text>
          <Text style={[styles.ratingValue, { color: colors.primary }]}>{displayedPoints}</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statsRow}>
            <View style={[styles.statItem]}>
              <Text style={[styles.statEmoji]}>⚡️</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{displayedWorkouts}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('leaderboard_profile_total_workouts')}</Text>
            </View>
            <View style={[styles.statItem]}>
              <Text style={[styles.statEmoji]}>🔥</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{displayedStreak}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('leaderboard_profile_streak_days')}</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statItem]}>
              <Text style={[styles.statEmoji]}>🏆</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>#{userProfile.rank}</Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('leaderboard_profile_rank')}</Text>
            </View>
            <View style={[styles.statItem]}>
              <Text style={[styles.statEmoji]}>📅</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>
                {formatDate(userProfile.last_workout_date).slice(0, 5)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('leaderboard_profile_last_workout')}</Text>
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderComingSoonSection = (title: string) => (
    <View style={[styles.detailedStatsContainer, { backgroundColor: colors.card }]}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        <View style={[styles.comingSoonBadge, { backgroundColor: colors.primary }]}>
          <Text style={styles.comingSoonText}>{t('leaderboard_profile_coming_soon')}</Text>
        </View>
      </View>
      <Text style={[styles.comingSoonDescription, { color: colors.textSecondary }]}>
        {t('leaderboard_profile_coming_soon_description')}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={currentTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      
      <View style={[styles.header, { 
        backgroundColor: colors.background,
        borderBottomColor: colors.cardBorder,
        borderBottomWidth: 1,
      }]}>
        <TouchableOpacity 
          onPress={() => navigation.goBack()} 
          style={styles.backButton}
        >
          <SvgXml 
            xml={backIcon.replace(/currentColor/g, currentTheme === 'dark' ? '#FFFFFF' : '#000000')} 
            width={24} 
            height={24} 
          />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>{t('leaderboard_profile_title')}</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profil Başlığı */}
        <View style={[styles.profileSection, { backgroundColor: colors.background }]}>
          <View style={[styles.profileImageContainer, { borderColor: colors.primary }]}>
            <Image
              source={userProfile?.profile_image_url ? { uri: userProfile.profile_image_url } : require('../assets/logo.png')}
              style={styles.profileImage}
            />
          </View>
          <Text style={[styles.displayName, { color: colors.text }]}>
            {userProfile?.display_name}
          </Text>
          {userProfile?.skill_level && (
            <View style={[styles.levelBadge, { backgroundColor: colors.card }]}>
              <Text style={[styles.levelText, { color: colors.textSecondary }]}>
                🏆 {userProfile.skill_level} {t('leaderboard_profile_level_suffix')}
              </Text>
            </View>
          )}
          {userProfile?.bio && (
            <Text style={[styles.bio, { color: colors.textSecondary }]}>
              {userProfile.bio}
            </Text>
          )}
          {renderSocialButtons()}
        </View>

        {/* İstatistikler */}
        {renderStats()}

        {/* Detaylı Analiz */}
        <View style={[styles.analysisContainer, { backgroundColor: colors.card }]}>
          <View style={styles.analysisHeader}>
            <Text style={[styles.analysisTitle, { color: colors.text }]}>{t('leaderboard_profile_detailed_analysis')}</Text>
            <View style={[styles.comingSoonBadge, { backgroundColor: `${colors.primary}15` }]}>
              <Text style={[styles.comingSoonText, { color: colors.primary }]}>{t('leaderboard_profile_coming_soon')}</Text>
            </View>
          </View>
          <View style={styles.analysisContent}>
            <Text style={[styles.analysisDescription, { color: colors.textSecondary }]}>
              {t('leaderboard_profile_great_things_coming')}
            </Text>
            <View style={styles.featureList}>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>{t('leaderboard_profile_feature_1')}</Text>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>{t('leaderboard_profile_feature_2')}</Text>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>{t('leaderboard_profile_feature_3')}</Text>
              <Text style={[styles.featureItem, { color: colors.textSecondary }]}>{t('leaderboard_profile_feature_4')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  profileImageContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  bio: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  statsContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  ratingSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  ratingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  ratingValue: {
    fontSize: 48,
    fontWeight: '700',
  },
  statsGrid: {
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 12,
    padding: 12,
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  levelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  levelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  analysisContainer: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
  },
  analysisHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  analysisTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  analysisContent: {
    alignItems: 'center',
  },
  analysisDescription: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  featureList: {
    marginTop: 16,
  },
  featureItem: {
    fontSize: 14,
    marginBottom: 12,
  },
  detailedStatsContainer: {
    margin: 16,
    borderRadius: 16,
    padding: 16,
    minHeight: 120,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  socialLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  socialButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  socialButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  comingSoonBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  comingSoonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  comingSoonDescription: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  comingSoonContainer: {
    padding: 20,
    borderRadius: 15,
    marginVertical: 10,
    borderWidth: 1,
  },
  comingSoonHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
});

export default LeaderboardProfileScreen; 