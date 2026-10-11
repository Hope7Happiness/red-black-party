import { handle } from '@/lib/game-api';
export const POST=async(request:Request,{params}:{params:Promise<{code:string}>})=>handle(request,(await params).code,'join');
