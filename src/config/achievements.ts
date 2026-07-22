export interface TitleAchievement {
  id: string;
  title: string;
  description: string;
  conditionDescription: string;
  checkFn: (stats: UserStats) => boolean;
}

export interface UserStats {
  completedAsAcceptor: number;
  completedAsRequester: number;
  averageRating: number;
  ratingCount: number;
  broadcastCount: number;
}

export const TITLE_ACHIEVEMENTS: TitleAchievement[] = [
  {
    id: 'rookie_hero',
    title: '小試身手',
    description: '踏出互助的第一步！',
    conditionDescription: '成功承接並完成 1 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 1,
  },
  {
    id: 'helper_pro',
    title: '內褲外穿的先驅者',
    description: '初出茅廬，不需要太講究。',
    conditionDescription: '成功承接並完成 5 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 5,
  },
  {
    id: 'first_hero',
    title: '佔用電話亭的傢伙',
    description: '換衣服需要點時間，請各位體諒。',
    conditionDescription: '成功承接並完成 15 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 15,
  },
  {
    id: 'second_hero',
    title: '穿披風的社區守護者',
    description: '披風不是弱點，飛機引擎才是。',
    conditionDescription: '成功承接並完成 45 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 45,
  },
  {
    id: 'third_hero',
    title: '胸前印著大寫Ｓ的好人',
    description: '擁有拯救世界的實力，但只想做個普通的好人。',
    conditionDescription: '成功承接並完成 100 次委託任務',
    checkFn: (stats) => stats.completedAsAcceptor >= 100,
  },
  {
    id: 'generous_boss',
    title: '995 My Hero',
    description: '樂於為超人帶來任務機會。',
    conditionDescription: '發布並順利完成 3 次委託任務',
    checkFn: (stats) => stats.completedAsRequester >= 3,
  },
  {
    id: 'loudspeaker',
    title: '黃金大喇叭',
    description: '善用廣播宣傳，活絡社區氣氛。',
    conditionDescription: '發送緊急廣播達 3 次以上',
    checkFn: (stats) => stats.broadcastCount >= 3,
  }
];

export const TASK_CATEGORIES = [
  '跑腿代購',
  '家事清潔',
  '寵物照顧',
  '課業輔導',
  '水電維修',
  '文書處理',
  '搬家協助',
  '買賣交換',
  '工作機會',
  '其他'
];

export const TAIWAN_REGIONS = [
  '台北市',
  '新北市',
  '基隆市',
  '宜蘭縣',
  '桃園市',
  '新竹市',
  '新竹縣',
  '苗栗縣',
  '台中市',
  '彰化縣',
  '南投縣',
  '雲林縣',
  '嘉義市',
  '嘉義縣',
  '台南市',
  '高雄市',
  '屏東縣',
  '花蓮縣',
  '台東縣',
  '澎湖縣',
  '金門縣',
  '連江縣'
];
