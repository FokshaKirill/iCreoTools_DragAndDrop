using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace iCreoTools_DragAndDrop.Controllers;

public class HomeController : Controller
{
    private readonly ILogger<HomeController> _logger;

    public HomeController(ILogger<HomeController> logger)
    {
        _logger = logger;
    }

    public IActionResult Index()
    {
        var baseUrl = $"{Request.Scheme}://{Request.Host}";
                ViewBag.BaseUrl = baseUrl;
                return View();
    }

    public IActionResult Privacy()
    {
        return View();
    }
}