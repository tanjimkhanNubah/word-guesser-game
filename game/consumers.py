import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer

ROOMS = {}

class GameConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'game_{self.room_name}'

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.room_name not in ROOMS:
            ROOMS[self.room_name] = {
                'players': [],
                'scores': {},
                'current_chooser_idx': 0,
                'target_word': '',
                'phase': 'WAITING',
                'questions_asked': 0,
                'max_q': 8,
                'player_guesses': {},
                'total_rounds': 0,
                'completed_rounds': 0,
                'is_processing_turn': False
            }

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        action = data.get('action')
        player = data.get('player')
        game_state = ROOMS[self.room_name]

        if action == 'join':
            if player and player not in game_state['players']:
                game_state['players'].append(player)
                game_state['scores'][player] = 0

            # 3 or more players trigger game start
            if len(game_state['players']) >= 3 and game_state['phase'] == 'WAITING':
                game_state['phase'] = 'WORD_SELECT'
                game_state['total_rounds'] = len(game_state['players'])
            
            await self.broadcast_state()

        elif action == 'set_word':
            if len(game_state['players']) > 0 and game_state['players'][game_state['current_chooser_idx']] == player:
                game_state['target_word'] = data.get('word', '').strip().lower()
                game_state['phase'] = 'PLAYING'
                game_state['questions_asked'] = 0
                game_state['player_guesses'] = {p: 0 for p in game_state['players']}
                game_state['is_processing_turn'] = False
                await self.broadcast_state()

        elif action == 'ask_question':
            if game_state['phase'] == 'PLAYING' and game_state['questions_asked'] < game_state['max_q']:
                game_state['questions_asked'] += 1
                await self.broadcast({
                    'type': 'new_question',
                    'question': data.get('question'),
                    'by': player,
                    'q_count': game_state['questions_asked'],
                    'max_q': game_state['max_q']
                })

        elif action == 'answer_question':
            if len(game_state['players']) > 0:
                current_chooser = game_state['players'][game_state['current_chooser_idx']]
                if player == current_chooser:
                    await self.broadcast({
                        'type': 'new_answer',
                        'answer': data.get('answer'),
                        'quoted_question': data.get('quoted_question'),
                        'by': player
                    })

        elif action == 'submit_guess':
            if len(game_state['players']) == 0:
                return
            current_chooser = game_state['players'][game_state['current_chooser_idx']]
            if player == current_chooser or game_state['phase'] != 'PLAYING':
                return

            guess = data.get('guess', '').strip().lower()
            max_guesses = 3
            
            if game_state['player_guesses'].get(player, 0) < max_guesses:
                game_state['player_guesses'][player] += 1
                
                if guess == game_state['target_word']:
                    if not game_state.get('is_processing_turn', False):
                        game_state['is_processing_turn'] = True
                        game_state['scores'][player] += 1
                        await self.broadcast({
                            'type': 'correct_guess',
                            'player': player,
                            'word': game_state['target_word']
                        })
                        await self.finish_turn()
                else:
                    guesses_left = max_guesses - game_state['player_guesses'][player]
                    await self.broadcast({
                        'type': 'wrong_guess',
                        'player': player,
                        'guesses_left': guesses_left
                    })
                    await self.broadcast_state()
                    
                    active_guessers = [p for p in game_state['players'] if p != current_chooser]
                    all_failed = all(game_state['player_guesses'].get(p, 0) >= max_guesses for p in active_guessers)
                    
                    if all_failed and not game_state.get('is_processing_turn', False):
                        game_state['is_processing_turn'] = True
                        game_state['scores'][current_chooser] += 2
                        await self.broadcast({
                            'type': 'system_notice',
                            'msg': f'❌ Everyone used 3 guesses! Chooser ({current_chooser}) gets 2 points!'
                        })
                        await self.finish_turn()

        elif action == 'timer_expired':
            if len(game_state['players']) > 0:
                current_chooser = game_state['players'][game_state['current_chooser_idx']]
                if not game_state.get('is_processing_turn', False) and game_state['phase'] == 'PLAYING':
                    game_state['is_processing_turn'] = True
                    game_state['scores'][current_chooser] += 2
                    await self.broadcast({
                        'type': 'system_notice',
                        'msg': f'⏰ Time expired! Chooser ({current_chooser}) gets 2 points!'
                    })
                    await self.finish_turn()

        elif action == 'restart_game':
            game_state['scores'] = {p: 0 for p in game_state['players']}
            game_state['current_chooser_idx'] = 0
            game_state['completed_rounds'] = 0
            game_state['phase'] = 'WORD_SELECT'
            game_state['is_processing_turn'] = False
            await self.broadcast_state()

    async def finish_turn(self):
        game_state = ROOMS[self.room_name]
        game_state['completed_rounds'] += 1

        if game_state['completed_rounds'] >= len(game_state['players']):
            game_state['phase'] = 'GAME_OVER'
            await self.broadcast_state()
        else:
            game_state['phase'] = 'SCOREBOARD'
            await self.broadcast_state()

            await asyncio.sleep(10)

            game_state['current_chooser_idx'] = (game_state['current_chooser_idx'] + 1) % len(game_state['players'])
            game_state['phase'] = 'WORD_SELECT'
            game_state['is_processing_turn'] = False
            await self.broadcast_state()

    async def broadcast_state(self):
        # Serialize state safely for Channel Layer Redis
        state_data = json.loads(json.dumps(ROOMS[self.room_name]))
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_message',
                'payload': {
                    'type': 'state_update',
                    'state': state_data
                }
            }
        )

    async def broadcast(self, payload):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_message',
                'payload': payload
            }
        )

    async def game_message(self, event):
        await self.send(text_data=json.dumps(event['payload']))