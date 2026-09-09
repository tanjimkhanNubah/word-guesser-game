from django.shortcuts import render

# Create your views here.
from django.shortcuts import render, redirect

def index(request):
    if request.method == "POST":
        room_name = request.POST.get("room_name")
        player_name = request.POST.get("player_name")
        return redirect(f'/game/{room_name}/?player={player_name}')
    return render(request, 'game/index.html')

def room(request, room_name):
    player_name = request.GET.get('player', 'Anonymous')
    return render(request, 'game/room.html', {
        'room_name': room_name,
        'player_name': player_name
    })